const { query } = require('../../config/db');

async function listBulkTiers(req, res, next) {
  try {
    const { id } = req.params;
    const tiers = await query('SELECT * FROM product_bulk_pricing WHERE product_id = ? AND is_active = 1 ORDER BY min_qty ASC', [id]);
    res.json({ success: true, data: { tiers } });
  } catch (error) {
    next(error);
  }
}

async function createBulkTier(req, res, next) {
  try {
    const { id } = req.params;
    const { variant_id, applies_to = 'both', tier_type, min_qty, max_qty, value, label } = req.body;

    if (!tier_type || min_qty === undefined || value === undefined) {
      return res.status(400).json({ success: false, message: 'tier_type, min_qty, and value are required' });
    }

    const result = await query(
      `INSERT INTO product_bulk_pricing (product_id, variant_id, applies_to, tier_type, min_qty, max_qty, value, label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, variant_id || null, applies_to, tier_type, parseInt(min_qty, 10), max_qty ? parseInt(max_qty, 10) : null, parseFloat(value), label || `Buy ${min_qty}+`]
    );

    res.status(201).json({ success: true, message: 'Bulk pricing tier created', data: { id: result.insertId } });
  } catch (error) {
    next(error);
  }
}

async function updateBulkTier(req, res, next) {
  try {
    const { id, tierId } = req.params;
    const { applies_to, tier_type, min_qty, max_qty, value, label, is_active } = req.body;

    await query(
      `UPDATE product_bulk_pricing SET applies_to = COALESCE(?, applies_to), tier_type = COALESCE(?, tier_type), min_qty = COALESCE(?, min_qty), max_qty = COALESCE(?, max_qty), value = COALESCE(?, value), label = COALESCE(?, label), is_active = COALESCE(?, is_active) WHERE id = ? AND product_id = ?`,
      [applies_to, tier_type, min_qty, max_qty, value, label, is_active, tierId, id]
    );

    res.json({ success: true, message: 'Bulk pricing tier updated' });
  } catch (error) {
    next(error);
  }
}

async function deleteBulkTier(req, res, next) {
  try {
    const { id, tierId } = req.params;
    await query('DELETE FROM product_bulk_pricing WHERE id = ? AND product_id = ?', [tierId, id]);
    res.json({ success: true, message: 'Bulk pricing tier deleted' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listBulkTiers,
  createBulkTier,
  updateBulkTier,
  deleteBulkTier
};
