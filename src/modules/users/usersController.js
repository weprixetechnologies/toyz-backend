const bcrypt = require('bcryptjs');
const { query } = require('../../config/db');

async function listUsers(req, res, next) {
  try {
    const { role, status, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClause = 'WHERE u.deleted_at IS NULL';
    const params = [];

    if (role) {
      whereClause += ' AND u.role = ?';
      params.push(role);
    }
    if (status) {
      whereClause += ' AND u.status = ?';
      params.push(status);
    }
    if (search) {
      whereClause += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.gstin LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countSql = `SELECT COUNT(*) as total FROM users u ${whereClause}`;
    const [{ total }] = await query(countSql, params);

    const usersSql = `
      SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.avatar, u.gstin, u.referral_code, u.segment_tags, u.created_at,
             (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as total_orders,
             (SELECT COALESCE(SUM(grand_total), 0) FROM orders WHERE user_id = u.id AND status != 'cancelled') as total_spend
      FROM users u
      ${whereClause}
      ORDER BY u.id DESC
      LIMIT ? OFFSET ?
    `;
    const users = await query(usersSql, [...params, parseInt(limit, 10), offset]);

    res.set('X-Total-Count', total);
    res.json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getUserById(req, res, next) {
  try {
    const { id } = req.params;
    const users = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.avatar, u.gstin, u.referral_code, u.segment_tags, u.created_at,
              (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as total_orders,
              (SELECT COALESCE(SUM(grand_total), 0) FROM orders WHERE user_id = u.id AND status != 'cancelled') as total_spend
       FROM users u
       WHERE u.id = ? AND u.deleted_at IS NULL`,
      [id]
    );
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];

    // Fetch user addresses
    const addresses = await query('SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', [id]);
    user.addresses = addresses || [];

    // Fetch reseller profile if retailer/reseller
    const resellerProfiles = await query('SELECT * FROM reseller_profiles WHERE user_id = ?', [id]);
    user.reseller_profile = resellerProfiles.length > 0 ? resellerProfiles[0] : null;

    res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
}

async function getUserOrders(req, res, next) {
  try {
    const { id } = req.params;

    const users = await query('SELECT id, name, email, phone, role FROM users WHERE id = ?', [id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];

    const orders = await query(
      `SELECT o.*,
              (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
       FROM orders o
       WHERE o.user_id = ?
       ORDER BY o.id DESC`,
      [id]
    );

    for (const o of orders) {
      const items = await query('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
      o.items = items || [];
    }

    res.json({
      success: true,
      data: {
        user,
        orders,
        total_orders: orders.length,
        total_spent: orders.reduce((sum, o) => o.status !== 'cancelled' ? sum + parseFloat(o.grand_total || 0) : sum, 0)
      }
    });
  } catch (error) {
    next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { name, email, phone, role, status, gstin } = req.body;

    const [user] = await query('SELECT role FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await query(
      `UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), role = COALESCE(?, role), status = COALESCE(?, status), gstin = COALESCE(?, gstin) WHERE id = ? AND deleted_at IS NULL`,
      [name, email, phone, role, status, gstin, id]
    );

    // If role changed to retailer, ensure a reseller profile exists
    if (role && role === 'retailer' && user.role !== 'retailer') {
      const existing = await query('SELECT id FROM reseller_profiles WHERE user_id = ?', [id]);
      if (existing.length === 0) {
        await query(
          `INSERT INTO reseller_profiles (user_id, status, business_name, approved_at) VALUES (?, 'approved', ?, NOW())`,
          [id, name || '']
        );
      } else {
        await query(`UPDATE reseller_profiles SET status = 'approved' WHERE user_id = ?`, [id]);
      }
    }

    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    await query('UPDATE users SET deleted_at = NOW() WHERE id = ?', [id]);
    res.json({ success: true, message: 'User soft-deleted successfully' });
  } catch (error) {
    next(error);
  }
}

async function banUser(req, res, next) {
  try {
    const { id } = req.params;
    await query("UPDATE users SET status = 'banned' WHERE id = ?", [id]);
    res.json({ success: true, message: 'User banned successfully' });
  } catch (error) {
    next(error);
  }
}

async function getOwnProfile(req, res, next) {
  try {
    res.json({ success: true, data: { user: req.user } });
  } catch (error) {
    next(error);
  }
}

async function updateOwnProfile(req, res, next) {
  try {
    const { name, phone, gstin, avatar } = req.body;
    await query(
      `UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), gstin = COALESCE(?, gstin), avatar = COALESCE(?, avatar) WHERE id = ?`,
      [name, phone, gstin, avatar, req.user.id]
    );
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    next(error);
  }
}

async function changeOwnPassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required' });
    }

    const [user] = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Incorrect current password' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
}

async function listOwnAddresses(req, res, next) {
  try {
    const addresses = await query('SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', [req.user.id]);
    res.json({ success: true, data: { addresses } });
  } catch (error) {
    next(error);
  }
}

async function addOwnAddress(req, res, next) {
  try {
    const { label, name, phone, line1, line2, city, state, pin_code, country = 'India', is_default } = req.body;
    if (!line1 || !city || !state || !pin_code) {
      return res.status(400).json({ success: false, message: 'Address line1, city, state, and pin_code are required' });
    }

    if (is_default) {
      await query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    }

    const result = await query(
      `INSERT INTO user_addresses (user_id, label, name, phone, line1, line2, city, state, pin_code, country, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, label || 'Home', name || req.user.name, phone || req.user.phone, line1, line2 || null, city, state, pin_code, country, is_default ? 1 : 0]
    );

    res.status(201).json({ success: true, message: 'Address added successfully', data: { address_id: result.insertId } });
  } catch (error) {
    next(error);
  }
}

async function updateOwnAddress(req, res, next) {
  try {
    const { id } = req.params;
    const { label, name, phone, line1, line2, city, state, pin_code, country, is_default } = req.body;

    if (is_default) {
      await query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    }

    await query(
      `UPDATE user_addresses SET label = COALESCE(?, label), name = COALESCE(?, name), phone = COALESCE(?, phone), line1 = COALESCE(?, line1), line2 = COALESCE(?, line2), city = COALESCE(?, city), state = COALESCE(?, state), pin_code = COALESCE(?, pin_code), country = COALESCE(?, country), is_default = COALESCE(?, is_default) WHERE id = ? AND user_id = ?`,
      [label, name, phone, line1, line2, city, state, pin_code, country, is_default, id, req.user.id]
    );

    res.json({ success: true, message: 'Address updated successfully' });
  } catch (error) {
    next(error);
  }
}

async function deleteOwnAddress(req, res, next) {
  try {
    const { id } = req.params;
    await query('DELETE FROM user_addresses WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true, message: 'Address deleted successfully' });
  } catch (error) {
    next(error);
  }
}

async function setDefaultAddress(req, res, next) {
  try {
    const { id } = req.params;
    await query('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    await query('UPDATE user_addresses SET is_default = 1 WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true, message: 'Default address updated' });
  } catch (error) {
    next(error);
  }
}

async function updateSegmentTags(req, res, next) {
  try {
    const { id } = req.params;
    const { tags } = req.body;
    const tagStr = Array.isArray(tags) ? tags.join(',') : (tags || '');

    await query('UPDATE users SET segment_tags = ? WHERE id = ?', [tagStr, id]);
    res.json({
      success: true,
      data: { user_id: id, segment_tags: tagStr },
      message: 'User segmentation tags updated successfully'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listUsers,
  getUserById,
  getUserOrders,
  updateUser,
  deleteUser,
  banUser,
  getOwnProfile,
  updateOwnProfile,
  changeOwnPassword,
  listOwnAddresses,
  addOwnAddress,
  updateOwnAddress,
  deleteOwnAddress,
  setDefaultAddress,
  updateSegmentTags
};
