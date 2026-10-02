const { query } = require('../config/db');
const { getOrSet } = require('../cache/cacheAside');
const { KEYS, TTL } = require('../cache/keys');

async function getActiveOffers() {
  return getOrSet(KEYS.offersActive(), TTL.OFFERS_ACTIVE, async () => {
    return query(
      `SELECT * FROM offers
       WHERE is_active = 1
         AND (start_time IS NULL OR start_time <= NOW())
         AND (end_time IS NULL OR end_time >= NOW())
       ORDER BY priority DESC, id ASC`
    );
  });
}

async function validateCoupon(code, subtotal, userId) {
  if (!code) return null;

  const coupons = await query(
    `SELECT * FROM coupons
     WHERE code = ?
       AND is_active = 1
       AND (start_time IS NULL OR start_time <= NOW())
       AND (expires_at IS NULL OR expires_at >= NOW())`,
    [code.toUpperCase()]
  );

  if (coupons.length === 0) {
    throw new Error('Invalid or expired coupon code');
  }

  const coupon = coupons[0];

  if (coupon.max_uses && coupon.uses_count >= coupon.max_uses) {
    throw new Error('Coupon usage limit reached');
  }

  if (subtotal < parseFloat(coupon.min_cart_value || 0)) {
    throw new Error(`Minimum cart value of ₹${coupon.min_cart_value} required for this coupon`);
  }

  let discountAmt = 0;
  if (coupon.discount_type === 'percent') {
    discountAmt = (subtotal * parseFloat(coupon.discount_value)) / 100;
    if (coupon.max_discount && discountAmt > parseFloat(coupon.max_discount)) {
      discountAmt = parseFloat(coupon.max_discount);
    }
  } else if (coupon.discount_type === 'flat') {
    discountAmt = parseFloat(coupon.discount_value);
  }

  return {
    id: coupon.id,
    code: coupon.code,
    discount_type: coupon.discount_type,
    discount_value: parseFloat(coupon.discount_value),
    discount_amount: Math.min(discountAmt, subtotal)
  };
}

async function evaluateOffers({ subtotal, cartItems, userRole = 'customer', couponCode = null, userId = null, selectedOfferIds = [] }) {
  const activeOffers = await getActiveOffers();
  const selected = new Set((Array.isArray(selectedOfferIds) ? selectedOfferIds : []).map(id => String(id)));
  let offerDiscount = 0;
  const appliedOffers = [];
  const availableOffers = [];
  const rejectedOfferIds = [];

  for (const offer of activeOffers) {
    // Role check
    let roles = ['customer', 'retailer'];
    if (offer.user_roles) {
      try {
        roles = typeof offer.user_roles === 'string' ? JSON.parse(offer.user_roles) : offer.user_roles;
      } catch (e) {}
    }
    const retailerBlocked = userRole === 'retailer';
    const roleEligible = roles.includes(userRole) && !retailerBlocked;
    let userEligible = true;
    if (offer.user_ids) {
      try {
        const userIds = typeof offer.user_ids === 'string' ? JSON.parse(offer.user_ids) : offer.user_ids;
        userEligible = Array.isArray(userIds) && userIds.map(String).includes(String(userId));
      } catch (e) {
        userEligible = false;
      }
    }
    const minValueEligible = subtotal >= parseFloat(offer.min_cart_value || 0);
    const eligible = roleEligible && userEligible && minValueEligible;
    const blockedReason = retailerBlocked
      ? 'RETAILER'
      : (!roles.includes(userRole) || !userEligible ? 'NOT ELIGIBLE' : (!minValueEligible ? `MINIMUM CART VALUE ₹${offer.min_cart_value}` : null));

    availableOffers.push({
      id: offer.id,
      name: offer.name,
      description: offer.description,
      offer_type: offer.offer_type,
      discount_type: offer.discount_type,
      discount_value: parseFloat(offer.discount_value || 0),
      min_cart_value: parseFloat(offer.min_cart_value || 0),
      stackable: Boolean(offer.stackable),
      eligible,
      blocked_reason: blockedReason,
      applied: false
    });

    if (!eligible || !selected.has(String(offer.id))) {
      if (selected.has(String(offer.id)) && !eligible) rejectedOfferIds.push(offer.id);
      continue;
    }

    let discountForThisOffer = 0;
    if (offer.discount_type === 'percent') {
      discountForThisOffer = (subtotal * parseFloat(offer.discount_value)) / 100;
      if (offer.max_discount && discountForThisOffer > parseFloat(offer.max_discount)) {
        discountForThisOffer = parseFloat(offer.max_discount);
      }
    } else if (offer.discount_type === 'flat') {
      discountForThisOffer = parseFloat(offer.discount_value);
    }

    if (discountForThisOffer > 0) {
      offerDiscount += discountForThisOffer;
      availableOffers[availableOffers.length - 1].applied = true;
      appliedOffers.push({
        id: offer.id,
        name: offer.name,
        discount_amount: discountForThisOffer
      });

      // If non-stackable offer applied, stop processing remaining offers
      if (!offer.stackable) break;
    }
  }

  const remainingSubtotal = Math.max(0, subtotal - offerDiscount);
  let appliedCoupon = null;
  let couponDiscount = 0;

  if (couponCode) {
    try {
      if (userRole === 'retailer') throw new Error('Retailers cannot apply extra offers or coupons');
      appliedCoupon = await validateCoupon(couponCode, remainingSubtotal, userId);
      if (appliedCoupon) {
        couponDiscount = appliedCoupon.discount_amount;
      }
    } catch (err) {
      appliedCoupon = { code: couponCode, error: err.message, valid: false };
    }
  }

  const totalDiscount = offerDiscount + couponDiscount;
  const finalSubtotal = Math.max(0, subtotal - totalDiscount);

  return {
    subtotal,
    offer_discount: offerDiscount,
    coupon_discount: couponDiscount,
    total_discount: totalDiscount,
    final_subtotal: finalSubtotal,
    applied_offers: appliedOffers,
    applied_coupon: appliedCoupon,
    available_offers: availableOffers,
    rejected_offer_ids: rejectedOfferIds
  };
}

module.exports = {
  getActiveOffers,
  validateCoupon,
  evaluateOffers
};
