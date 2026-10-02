const { query } = require('../../config/db');
const { v4: uuidv4 } = require('uuid');
const { evaluateOffers } = require('../../utils/offerEngine');
const { resolvePrice } = require('../../utils/priceResolver');
const shippingService = require('../shipping/shippingService');

async function getOrCreateCart(req) {
  let cart = null;
  const userId = req.user?.id;
  const guestToken = req.guest_token || req.headers['x-guest-token'] || req.body?.guest_token || req.query?.guest_token;

  if (userId) {
    const carts = await query('SELECT * FROM carts WHERE user_id = ?', [userId]);
    if (carts.length > 0) {
      cart = carts[0];
    } else {
      const res = await query('INSERT INTO carts (user_id) VALUES (?)', [userId]);
      cart = { id: res.insertId, user_id: userId };
    }
  } else if (guestToken) {
    const carts = await query('SELECT * FROM carts WHERE guest_token = ?', [guestToken]);
    if (carts.length > 0) {
      cart = carts[0];
    } else {
      const res = await query('INSERT INTO carts (guest_token) VALUES (?)', [guestToken]);
      cart = { id: res.insertId, guest_token: guestToken };
    }
  } else {
    const newGuestToken = uuidv4();
    const res = await query('INSERT INTO carts (guest_token) VALUES (?)', [newGuestToken]);
    cart = { id: res.insertId, guest_token: newGuestToken };
    req.guest_token = newGuestToken; // Save to req for chained function calls
  }

  return cart;
}

async function getCart(req, res, next) {
  try {
    const cart = await getOrCreateCart(req);
    const couponCode = req.query?.coupon_code || req.body?.coupon_code || cart.applied_coupon_code || null;
    let selectedOfferIds = req.query?.selected_offer_ids || req.body?.selected_offer_ids || [];
    if (typeof selectedOfferIds === 'string') {
      try { selectedOfferIds = JSON.parse(selectedOfferIds); } catch (e) { selectedOfferIds = selectedOfferIds.split(',').filter(Boolean); }
    }
    if (!Array.isArray(selectedOfferIds)) selectedOfferIds = [];

    const items = await query(
      `SELECT ci.*, p.name as product_name, p.slug as product_slug, p.base_price, p.sale_price,
              (SELECT url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as image,
              pv.sku as variant_sku, pv.price as variant_price, pv.sale_price as variant_sale_price
       FROM cart_items ci
       JOIN products p ON ci.product_id = p.id
       LEFT JOIN product_variants pv ON ci.variant_id = pv.id
       WHERE ci.cart_id = ?`,
      [cart.id]
    );

    let subtotal = 0;
    const formattedItems = [];
    for (const item of items) {
      const product = { id: item.product_id, base_price: item.base_price, sale_price: item.sale_price };
      const variant = item.variant_id
        ? { id: item.variant_id, price: item.variant_price, sale_price: item.variant_sale_price }
        : null;
      const priceInfo = await resolvePrice({ user: req.user || null, product, variant, qty: item.qty });
      const unitPrice = priceInfo.unit_price;
      const lineTotal = unitPrice * item.qty;
      subtotal += lineTotal;
      formattedItems.push({
        ...item,
        unit_price: unitPrice,
        original_price: priceInfo.original_price,
        discount_applied: priceInfo.discount_applied,
        price_source: priceInfo.source,
        line_total: lineTotal
      });
    }

    const offerEval = await evaluateOffers({
      subtotal,
      cartItems: formattedItems,
      userRole: req.user?.role || 'customer',
      couponCode,
      userId: req.user?.id || null,
      selectedOfferIds
    });

    const quote = items.length > 0
      ? await shippingService.getQuote({
          pinCode: req.query?.pin_code || req.body?.pin_code || null,
          subtotal: offerEval.final_subtotal,
          userRole: req.user?.role || 'customer'
        })
      : { cost: 0, source: 'empty' };
    const shippingCost = parseFloat(quote.cost || 0);
    const grandTotal = Math.max(0, offerEval.final_subtotal + shippingCost);

    res.json({
      success: true,
      data: {
        cart_id: cart.id,
        guest_token: cart.guest_token || null,
        items: formattedItems,
        summary: {
          subtotal,
          offer_discount: offerEval.offer_discount,
          coupon_discount: offerEval.coupon_discount,
          total_discount: offerEval.total_discount,
          shipping: shippingCost,
          shipping_source: quote.source,
          shipping_label: quote.label,
          grand_total: grandTotal,
          applied_offers: offerEval.applied_offers,
          applied_coupon: offerEval.applied_coupon,
          available_offers: offerEval.available_offers,
          rejected_offer_ids: offerEval.rejected_offer_ids,
          selected_offer_ids: selectedOfferIds
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

async function addItem(req, res, next) {
  try {
    const { product_id, variant_id } = req.body;
    const rawQty = req.body.qty ?? req.body.quantity ?? 1;
    const qty = parseInt(rawQty, 10);

    if (!product_id) {
      return res.status(400).json({ success: false, message: 'Product ID is required' });
    }
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ success: false, message: 'Valid quantity required' });
    }

    const products = await query(
      `SELECT p.id FROM products p
       LEFT JOIN product_variants pv ON pv.id = ? AND pv.product_id = p.id AND pv.is_active = 1
       WHERE p.id = ? AND p.deleted_at IS NULL AND p.is_active = 1
         AND (? IS NULL OR pv.id IS NOT NULL)`,
      [variant_id || null, product_id, variant_id || null]
    );
    if (products.length === 0) {
      return res.status(400).json({ success: false, message: 'Product or variant is no longer available' });
    }

    const cart = await getOrCreateCart(req);

    const existing = await query(
      'SELECT id, qty FROM cart_items WHERE cart_id = ? AND product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))',
      [cart.id, product_id, variant_id || null, variant_id || null]
    );

    if (existing.length > 0) {
      const newQty = existing[0].qty + qty;
      await query('UPDATE cart_items SET qty = ? WHERE id = ?', [newQty, existing[0].id]);
    } else {
      await query(
        'INSERT INTO cart_items (cart_id, product_id, variant_id, qty) VALUES (?, ?, ?, ?)',
        [cart.id, product_id, variant_id || null, qty]
      );
    }

    return getCart(req, res, next);
  } catch (error) {
    next(error);
  }
}

async function updateItem(req, res, next) {
  try {
    const { id } = req.params;
    const rawQty = req.body.qty ?? req.body.quantity;
    const qty = parseInt(rawQty, 10);

    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({ success: false, message: 'Valid quantity required' });
    }

    const cart = await getOrCreateCart(req);
    await query('UPDATE cart_items SET qty = ? WHERE id = ? AND cart_id = ?', [qty, id, cart.id]);

    return getCart(req, res, next);
  } catch (error) {
    next(error);
  }
}

async function removeItem(req, res, next) {
  try {
    const { id } = req.params;
    const cart = await getOrCreateCart(req);
    await query('DELETE FROM cart_items WHERE id = ? AND cart_id = ?', [id, cart.id]);

    return getCart(req, res, next);
  } catch (error) {
    next(error);
  }
}

async function clearCart(req, res, next) {
  try {
    const cart = await getOrCreateCart(req);
    await query('DELETE FROM cart_items WHERE cart_id = ?', [cart.id]);

    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    next(error);
  }
}

async function applyCoupon(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Coupon code required' });
    }
    if (req.user?.role === 'retailer') {
      return res.status(403).json({ success: false, message: 'Retailers cannot apply extra offers or coupons.' });
    }
    req.body.coupon_code = code;
    return getCart(req, res, next);
  } catch (error) {
    next(error);
  }
}

async function applyOffers(req, res, next) {
  try {
    if (req.user?.role === 'retailer') {
      return res.status(403).json({ success: false, message: 'Retailers cannot apply extra offers.' });
    }
    const selectedOfferIds = Array.isArray(req.body.selected_offer_ids) ? req.body.selected_offer_ids : [];
    req.body.selected_offer_ids = selectedOfferIds;
    return getCart(req, res, next);
  } catch (error) {
    next(error);
  }
}

async function removeCoupon(req, res, next) {
  try {
    req.body.coupon_code = null;
    return getCart(req, res, next);
  } catch (error) {
    next(error);
  }
}

async function mergeCart(req, res, next) {
  try {
    const { guestToken } = req.body;
    if (!req.user || !guestToken) {
      return res.status(400).json({ success: false, message: 'User must be logged in and guestToken provided' });
    }

    const userId = req.user.id;

    // Get or create user cart
    let userCarts = await query('SELECT id FROM carts WHERE user_id = ?', [userId]);
    let userCartId;
    if (userCarts.length === 0) {
      const inserted = await query('INSERT INTO carts (user_id) VALUES (?)', [userId]);
      userCartId = inserted.insertId;
    } else {
      userCartId = userCarts[0].id;
    }

    // Get guest cart
    const guestCarts = await query('SELECT id FROM carts WHERE guest_token = ?', [guestToken]);
    if (guestCarts.length > 0) {
      const guestCartId = guestCarts[0].id;
      
      const guestItems = await query('SELECT * FROM cart_items WHERE cart_id = ?', [guestCartId]);
      const userItems = await query('SELECT * FROM cart_items WHERE cart_id = ?', [userCartId]);

      for (const gItem of guestItems) {
        const matchingUItem = userItems.find(
          u => u.product_id === gItem.product_id && (u.variant_id === gItem.variant_id || (!u.variant_id && !gItem.variant_id))
        );

        if (matchingUItem) {
          const newQty = Math.max(matchingUItem.qty, gItem.qty);
          await query('UPDATE cart_items SET qty = ? WHERE id = ?', [newQty, matchingUItem.id]);
          await query('DELETE FROM cart_items WHERE id = ?', [gItem.id]);
        } else {
          await query('UPDATE cart_items SET cart_id = ? WHERE id = ?', [userCartId, gItem.id]);
        }
      }

      await query('DELETE FROM carts WHERE id = ?', [guestCartId]);
    }

    // Return merged cart
    req.query = { ...req.query, guest_token: null }; // Ensure we fetch user cart
    return getCart(req, res, next);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  applyCoupon,
  applyOffers,
  removeCoupon,
  mergeCart
};
