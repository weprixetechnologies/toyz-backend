const { query } = require('../../config/db');

async function listBadges(req, res, next) {
  try {
    const { search, is_active } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (b.name LIKE ? OR b.badge_text LIKE ? OR b.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (is_active !== undefined && is_active !== '') {
      whereClause += ' AND b.is_active = ?';
      params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
    }

    const sql = `
      SELECT b.*,
             (SELECT COUNT(*) 
              FROM product_badges pb 
              JOIN products p ON pb.product_id = p.id 
              WHERE pb.badge_id = b.id AND p.deleted_at IS NULL) as product_count
      FROM badges b
      ${whereClause}
      ORDER BY b.id DESC
    `;

    const badges = await query(sql, params);

    res.json({
      success: true,
      data: { badges }
    });
  } catch (error) {
    next(error);
  }
}

async function getBadgeById(req, res, next) {
  try {
    const { id } = req.params;

    const badges = await query('SELECT * FROM badges WHERE id = ?', [id]);
    if (!badges || badges.length === 0) {
      return res.status(404).json({ success: false, message: 'Badge not found' });
    }

    const badge = badges[0];

    const products = await query(
      `SELECT p.id, p.name, p.sku, p.base_price, p.sale_price, p.stock_qty, p.is_active, c.name as category_name,
              (SELECT url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image
       FROM product_badges pb
       JOIN products p ON pb.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE pb.badge_id = ? AND p.deleted_at IS NULL
       ORDER BY p.id DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        badge,
        products,
        product_ids: products.map(p => p.id)
      }
    });
  } catch (error) {
    next(error);
  }
}

async function createBadge(req, res, next) {
  try {
    const {
      name,
      badge_text,
      bg_color = '#ef4444',
      text_color = '#ffffff',
      icon = null,
      description = null,
      is_active = 1,
      product_ids = [],
      override_others = false
    } = req.body;

    if (!name || !badge_text) {
      return res.status(400).json({ success: false, message: 'Name and badge_text are required' });
    }

    const result = await query(
      `INSERT INTO badges (name, badge_text, bg_color, text_color, icon, description, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, badge_text, bg_color || '#ef4444', text_color || '#ffffff', icon || null, description || null, is_active ? 1 : 0]
    );

    const badgeId = result.insertId;

    if (Array.isArray(product_ids) && product_ids.length > 0) {
      for (const pid of product_ids) {
        if (override_others) {
          await query('DELETE FROM product_badges WHERE product_id = ?', [pid]);
        }
        await query('INSERT IGNORE INTO product_badges (product_id, badge_id) VALUES (?, ?)', [pid, badgeId]);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Badge created successfully',
      data: { id: badgeId }
    });
  } catch (error) {
    next(error);
  }
}

async function updateBadge(req, res, next) {
  try {
    const { id } = req.params;
    const {
      name,
      badge_text,
      bg_color,
      text_color,
      icon,
      description,
      is_active,
      product_ids,
      override_others = false
    } = req.body;

    const existing = await query('SELECT * FROM badges WHERE id = ?', [id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Badge not found' });
    }

    await query(
      `UPDATE badges SET
        name = COALESCE(?, name),
        badge_text = COALESCE(?, badge_text),
        bg_color = COALESCE(?, bg_color),
        text_color = COALESCE(?, text_color),
        icon = COALESCE(?, icon),
        description = COALESCE(?, description),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        name || null,
        badge_text || null,
        bg_color || null,
        text_color || null,
        icon || null,
        description !== undefined ? description : null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        id
      ]
    );

    if (Array.isArray(product_ids)) {
      await query('DELETE FROM product_badges WHERE badge_id = ?', [id]);
      for (const pid of product_ids) {
        if (override_others) {
          await query('DELETE FROM product_badges WHERE product_id = ?', [pid]);
        }
        await query('INSERT IGNORE INTO product_badges (product_id, badge_id) VALUES (?, ?)', [pid, id]);
      }
    }

    res.json({
      success: true,
      message: 'Badge updated successfully'
    });
  } catch (error) {
    next(error);
  }
}

async function deleteBadge(req, res, next) {
  try {
    const { id } = req.params;
    await query('DELETE FROM badges WHERE id = ?', [id]);
    res.json({ success: true, message: 'Badge deleted successfully' });
  } catch (error) {
    next(error);
  }
}

async function assignBadgeProducts(req, res, next) {
  try {
    const { id } = req.params;
    const { product_ids = [], override_others = false } = req.body;

    if (!Array.isArray(product_ids)) {
      return res.status(400).json({ success: false, message: 'product_ids must be an array' });
    }

    await query('DELETE FROM product_badges WHERE badge_id = ?', [id]);

    for (const pid of product_ids) {
      if (override_others) {
        await query('DELETE FROM product_badges WHERE product_id = ?', [pid]);
      }
      await query('INSERT IGNORE INTO product_badges (product_id, badge_id) VALUES (?, ?)', [pid, id]);
    }

    res.json({
      success: true,
      message: 'Badge product assignments updated successfully'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listBadges,
  getBadgeById,
  createBadge,
  updateBadge,
  deleteBadge,
  assignBadgeProducts
};
