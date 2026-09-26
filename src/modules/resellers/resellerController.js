const { query } = require('../../config/db');
const { resolvePrice } = require('../../utils/priceResolver');
const eventBus = require('../../events/bus');

async function applyReseller(req, res, next) {
  try {
    const { business_name, gstin, pan, address } = req.body;
    if (!business_name) {
      return res.status(400).json({ success: false, message: 'Business name is required' });
    }

    const existing = await query('SELECT id, status FROM reseller_profiles WHERE user_id = ?', [req.user.id]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: `Application already submitted. Current status: '${existing[0].status}'` });
    }

    const result = await query(
      `INSERT INTO reseller_profiles (user_id, business_name, gstin, pan, address, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [req.user.id, business_name, gstin || null, pan || null, address || null]
    );

    res.status(201).json({
      success: true,
      message: 'Reseller application submitted successfully and is pending admin approval',
      data: { profile_id: result.insertId, status: 'pending' }
    });
  } catch (error) {
    next(error);
  }
}

async function getOwnProfile(req, res, next) {
  try {
    const profiles = await query('SELECT * FROM reseller_profiles WHERE user_id = ?', [req.user.id]);
    if (profiles.length === 0) {
      return res.status(404).json({ success: false, message: 'No reseller profile found for this user' });
    }
    res.json({ success: true, data: { profile: profiles[0] } });
  } catch (error) {
    next(error);
  }
}

async function getResellerProducts(req, res, next) {
  try {
    const products = await query('SELECT * FROM products WHERE deleted_at IS NULL AND is_active = 1 AND visible_to_resellers = 1 ORDER BY id DESC');

    const result = [];
    for (const prod of products) {
      const priceRes = await resolvePrice({ user: req.user, product: prod, qty: 1 });
      const images = await query('SELECT url FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC LIMIT 1', [prod.id]);
      result.push({
        ...prod,
        reseller_price: priceRes.unit_price,
        original_price: priceRes.original_price,
        discount_applied: priceRes.discount_applied,
        pricing_source: priceRes.source,
        moq: priceRes.moq,
        image: images.length > 0 ? images[0].url : null
      });
    }

    res.json({ success: true, data: { products: result } });
  } catch (error) {
    next(error);
  }
}

async function getOwnResellerOrders(req, res, next) {
  try {
    const orders = await query('SELECT * FROM orders WHERE user_id = ? AND placed_by_role = "retailer" ORDER BY id DESC', [req.user.id]);
    res.json({ success: true, data: { orders } });
  } catch (error) {
    next(error);
  }
}

async function getOwnCredit(req, res, next) {
  try {
    const profiles = await query('SELECT credit_limit, credit_used FROM reseller_profiles WHERE user_id = ?', [req.user.id]);
    if (profiles.length === 0) {
      return res.status(404).json({ success: false, message: 'Reseller profile not found' });
    }
    const profile = profiles[0];
    const credit_available = Math.max(0, parseFloat(profile.credit_limit) - parseFloat(profile.credit_used));
    res.json({
      success: true,
      data: {
        credit_limit: parseFloat(profile.credit_limit),
        credit_used: parseFloat(profile.credit_used),
        credit_available
      }
    });
  } catch (error) {
    next(error);
  }
}

// Admin Reseller Management
async function listAdminResellers(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClause = '';
    const params = [];
    if (status) {
      whereClause = 'WHERE rp.status = ?';
      params.push(status);
    }

    const [{ total }] = await query(`SELECT COUNT(*) as total FROM reseller_profiles rp ${whereClause}`, params);
    const resellers = await query(
      `SELECT rp.*, u.name as user_name, u.email as user_email, u.phone as user_phone
       FROM reseller_profiles rp
       JOIN users u ON rp.user_id = u.id
       ${whereClause}
       ORDER BY rp.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    res.json({
      success: true,
      data: {
        resellers,
        pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), pages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getAdminResellerById(req, res, next) {
  try {
    const { id } = req.params;
    const resellers = await query(
      `SELECT rp.*, u.name as user_name, u.email as user_email, u.phone as user_phone
       FROM reseller_profiles rp
       JOIN users u ON rp.user_id = u.id
       WHERE rp.id = ?`,
      [id]
    );

    if (resellers.length === 0) return res.status(404).json({ success: false, message: 'Reseller profile not found' });
    const reseller = resellers[0];
    const customDiscounts = await query(
      `SELECT rpd.*, p.name as product_name, p.sku
       FROM reseller_product_discount rpd
       JOIN products p ON rpd.product_id = p.id
       WHERE rpd.reseller_id = ?`,
      [reseller.user_id]
    );

    res.json({ success: true, data: { reseller, custom_discounts: customDiscounts } });
  } catch (error) {
    next(error);
  }
}

async function approveReseller(req, res, next) {
  try {
    const { id } = req.params;
    const resellers = await query('SELECT * FROM reseller_profiles WHERE id = ?', [id]);
    if (resellers.length === 0) return res.status(404).json({ success: false, message: 'Reseller not found' });

    const reseller = resellers[0];

    // Upgrade user role to retailer
    await query("UPDATE users SET role = 'retailer' WHERE id = ?", [reseller.user_id]);

    // Update reseller profile
    await query(
      "UPDATE reseller_profiles SET status = 'approved', approved_at = NOW(), approved_by = ? WHERE id = ?",
      [req.user.id, id]
    );

    const users = await query('SELECT name, phone FROM users WHERE id = ?', [reseller.user_id]);
    const user = users[0] || {};

    // Emit reseller.approved event
    eventBus.emit('reseller.approved', {
      user_id: reseller.user_id,
      name: user.name || 'Reseller',
      phone: user.phone
    });

    res.json({ success: true, message: 'Reseller account approved and upgraded to retailer role' });
  } catch (error) {
    next(error);
  }
}

async function rejectReseller(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await query("UPDATE reseller_profiles SET status = 'rejected', rejection_reason = ? WHERE id = ?", [reason || null, id]);
    res.json({ success: true, message: 'Reseller application rejected' });
  } catch (error) {
    next(error);
  }
}

async function suspendReseller(req, res, next) {
  try {
    const { id } = req.params;
    const resellers = await query('SELECT user_id FROM reseller_profiles WHERE id = ?', [id]);
    if (resellers.length > 0) {
      await query("UPDATE users SET role = 'customer' WHERE id = ?", [resellers[0].user_id]);
    }
    await query("UPDATE reseller_profiles SET status = 'suspended' WHERE id = ?", [id]);
    res.json({ success: true, message: 'Reseller account suspended' });
  } catch (error) {
    next(error);
  }
}

async function setGlobalDiscount(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    let rawType = body.discount_type || body.type || 'percent';
    if (rawType === 'percentage') rawType = 'percent';
    const discountType = (rawType === 'flat') ? 'flat' : 'percent';

    const discountVal = body.discount_value ?? body.global_discount_value ?? body.global_discount_percent ?? body.value ?? 0;
    const hasSpecialPrice = body.has_special_price !== undefined ? Boolean(body.has_special_price) : true;

    await query(
      'UPDATE reseller_profiles SET has_special_price = ?, global_discount_type = ?, global_discount_value = ? WHERE id = ?',
      [hasSpecialPrice ? 1 : 0, discountType, parseFloat(discountVal || 0), id]
    );

    res.json({ success: true, message: 'Global reseller discount updated successfully' });
  } catch (error) {
    next(error);
  }
}

async function setCreditLimit(req, res, next) {
  try {
    const { id } = req.params;
    const { credit_limit } = req.body;

    await query('UPDATE reseller_profiles SET credit_limit = ? WHERE id = ?', [parseFloat(credit_limit || 0), id]);
    res.json({ success: true, message: 'Reseller credit limit updated' });
  } catch (error) {
    next(error);
  }
}

async function setProductDiscount(req, res, next) {
  try {
    const { id, productId } = req.params;
    const { discount_type, discount_value } = req.body;

    const resellers = await query('SELECT user_id FROM reseller_profiles WHERE id = ?', [id]);
    if (resellers.length === 0) return res.status(404).json({ success: false, message: 'Reseller not found' });
    const userId = resellers[0].user_id;

    await query(
      `INSERT INTO reseller_product_discount (reseller_id, product_id, discount_type, discount_value)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE discount_type = VALUES(discount_type), discount_value = VALUES(discount_value);`,
      [userId, productId, discount_type, discount_value]
    );

    res.json({ success: true, message: 'Per-product reseller discount updated' });
  } catch (error) {
    next(error);
  }
}

async function getProformaInvoice(req, res, next) {
  try {
    const { orderId } = req.params;
    const orders = await query('SELECT * FROM orders WHERE id = ? AND (user_id = ? OR ? IN ("admin","superadmin"))', [orderId, req.user.id, req.user.role]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orders[0];
    const items = await query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    const settingsList = await query('SELECT setting_key, setting_value FROM settings');
    const settings = {};
    settingsList.forEach((s) => settings[s.setting_key] = s.setting_value);

    const { generateProformaHtml } = require('../../utils/proformaPdf');
    const html = generateProformaHtml(order, items, settings);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  applyReseller,
  getOwnProfile,
  getResellerProducts,
  getOwnResellerOrders,
  getOwnCredit,
  getProformaInvoice,
  listAdminResellers,
  getAdminResellerById,
  approveReseller,
  rejectReseller,
  suspendReseller,
  setGlobalDiscount,
  setCreditLimit,
  setProductDiscount
};
