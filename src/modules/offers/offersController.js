const { query } = require('../../config/db');
const { evaluateOffers, validateCoupon } = require('../../utils/offerEngine');
const eventBus = require('../../events/bus');

async function validateCartOffers(req, res, next) {
  try {
    const { subtotal = 0, coupon_code } = req.body;
    const selectedOfferIds = Array.isArray(req.body.selected_offer_ids) ? req.body.selected_offer_ids : [];
    if (req.user?.role === 'retailer' && (coupon_code || selectedOfferIds.length > 0)) {
      return res.status(403).json({ success: false, message: 'Retailers cannot apply extra offers or coupons.' });
    }
    const evaluation = await evaluateOffers({
      subtotal: parseFloat(subtotal),
      userRole: req.user?.role || 'customer',
      couponCode: coupon_code || null,
      userId: req.user?.id || null,
      selectedOfferIds
    });

    res.json({ success: true, data: evaluation });
  } catch (error) {
    next(error);
  }
}

async function listOffers(req, res, next) {
  try {
    const sql = req.user?.role === 'admin' || req.user?.role === 'superadmin'
      ? 'SELECT * FROM offers ORDER BY priority DESC, id DESC'
      : `SELECT * FROM offers
         WHERE is_active = 1
           AND (start_time IS NULL OR start_time <= NOW())
           AND (end_time IS NULL OR end_time >= NOW())
         ORDER BY priority DESC, id DESC`;
    const offers = await query(sql);
    res.json({ success: true, data: { offers } });
  } catch (error) {
    next(error);
  }
}

async function getOfferById(req, res, next) {
  try {
    const { id } = req.params;
    const offers = await query('SELECT * FROM offers WHERE id = ?', [id]);
    if (offers.length === 0) return res.status(404).json({ success: false, message: 'Offer not found' });
    res.json({ success: true, data: { offer: offers[0] } });
  } catch (error) {
    next(error);
  }
}

async function createOffer(req, res, next) {
  try {
    const { name, description, offer_type, applies_to, min_cart_value, discount_type, discount_value, max_discount, priority, stackable, is_active } = req.body;
    if (!name || !offer_type) {
      return res.status(400).json({ success: false, message: 'Name and offer_type are required' });
    }

    const result = await query(
      `INSERT INTO offers (name, description, offer_type, applies_to, min_cart_value, discount_type, discount_value, max_discount, priority, stackable, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || null, offer_type, applies_to || 'cart', min_cart_value || 0, discount_type || null, discount_value || 0, max_discount || null, priority || 0, stackable ? 1 : 0, is_active !== undefined ? is_active : 1]
    );

    eventBus.emit('offer.changed', { id: result.insertId, action: 'create' });

    res.status(201).json({ success: true, message: 'Offer created', data: { id: result.insertId } });
  } catch (error) {
    next(error);
  }
}

async function updateOffer(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description, offer_type, applies_to, min_cart_value, discount_type, discount_value, max_discount, priority, stackable, is_active } = req.body;

    await query(
      `UPDATE offers SET name = COALESCE(?, name), description = COALESCE(?, description), offer_type = COALESCE(?, offer_type), applies_to = COALESCE(?, applies_to), min_cart_value = COALESCE(?, min_cart_value), discount_type = COALESCE(?, discount_type), discount_value = COALESCE(?, discount_value), max_discount = COALESCE(?, max_discount), priority = COALESCE(?, priority), stackable = COALESCE(?, stackable), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [name, description, offer_type, applies_to, min_cart_value, discount_type, discount_value, max_discount, priority, stackable, is_active, id]
    );

    eventBus.emit('offer.changed', { id, action: 'update' });

    res.json({ success: true, message: 'Offer updated' });
  } catch (error) {
    next(error);
  }
}

async function deleteOffer(req, res, next) {
  try {
    const { id } = req.params;
    await query('DELETE FROM offers WHERE id = ?', [id]);

    eventBus.emit('offer.changed', { id, action: 'delete' });

    res.json({ success: true, message: 'Offer deleted' });
  } catch (error) {
    next(error);
  }
}

// Coupons Management
async function listCoupons(req, res, next) {
  try {
    const coupons = await query('SELECT * FROM coupons ORDER BY id DESC');
    res.json({ success: true, data: { coupons } });
  } catch (error) {
    next(error);
  }
}

async function createCoupon(req, res, next) {
  try {
    const { code, discount_type, discount_value, min_cart_value, max_discount, max_uses, expires_at } = req.body;
    if (!code || !discount_type || !discount_value) {
      return res.status(400).json({ success: false, message: 'Code, discount_type, and discount_value are required' });
    }

    const result = await query(
      `INSERT INTO coupons (code, discount_type, discount_value, min_cart_value, max_discount, max_uses, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code.toUpperCase(), discount_type, discount_value, min_cart_value || 0, max_discount || null, max_uses || null, expires_at || null]
    );

    res.status(201).json({ success: true, message: 'Coupon created', data: { id: result.insertId, code: code.toUpperCase() } });
  } catch (error) {
    next(error);
  }
}

async function updateCoupon(req, res, next) {
  try {
    const { id } = req.params;
    const { code, discount_type, discount_value, min_cart_value, max_discount, max_uses, is_active } = req.body;

    await query(
      `UPDATE coupons SET code = COALESCE(?, code), discount_type = COALESCE(?, discount_type), discount_value = COALESCE(?, discount_value), min_cart_value = COALESCE(?, min_cart_value), max_discount = COALESCE(?, max_discount), max_uses = COALESCE(?, max_uses), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [code ? code.toUpperCase() : null, discount_type, discount_value, min_cart_value, max_discount, max_uses, is_active, id]
    );

    res.json({ success: true, message: 'Coupon updated' });
  } catch (error) {
    next(error);
  }
}

async function deleteCoupon(req, res, next) {
  try {
    const { id } = req.params;
    await query('DELETE FROM coupons WHERE id = ?', [id]);
    res.json({ success: true, message: 'Coupon deleted' });
  } catch (error) {
    next(error);
  }
}

async function bulkGenerateCoupons(req, res, next) {
  try {
    const { count = 10, prefix = 'PROMO', discount_type = 'percent', discount_value = 10, min_cart_value = 0 } = req.body;
    const generated = [];

    for (let i = 0; i < parseInt(count, 10); i++) {
      const code = `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
      await query(
        `INSERT INTO coupons (code, discount_type, discount_value, min_cart_value, max_uses)
         VALUES (?, ?, ?, ?, 1)`,
        [code, discount_type, discount_value, min_cart_value]
      );
      generated.push(code);
    }

    res.status(201).json({
      success: true,
      message: `Generated ${generated.length} unique coupons`,
      data: { coupons: generated }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  validateCartOffers,
  listOffers,
  getOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  bulkGenerateCoupons
};
