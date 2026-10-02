const { query } = require('../config/db');

async function getProductMoq(productId, variantId, user = null) {
  let moq = 1;
  const moqRows = await query('SELECT min_qty FROM product_moq WHERE product_id = ? AND (variant_id = ? OR variant_id IS NULL) ORDER BY variant_id DESC LIMIT 1', [productId, variantId || null]);
  if (moqRows.length > 0) {
    moq = moqRows[0].min_qty;
  }

  if (user && user.role === 'retailer') {
    const profile = await query('SELECT moq_override FROM reseller_profiles WHERE user_id = ? AND status = "approved"', [user.id]);
    if (profile.length > 0 && profile[0].moq_override) {
      moq = profile[0].moq_override;
    }
  }

  return moq;
}

async function isApprovedRetailer(user) {
  if (!user || user.role !== 'retailer') return false;
  const rows = await query(
    'SELECT id FROM reseller_profiles WHERE user_id = ? AND status = "approved" LIMIT 1',
    [user.id]
  );
  return rows.length > 0;
}

async function resolvePrice({ user, product, variant, qty = 1 }) {
  const originalPrice = parseFloat(variant ? variant.price : product.base_price);
  const retailSalePrice = parseFloat(variant ? (variant.sale_price || variant.price) : (product.sale_price || product.base_price));
  
  let unitPrice = retailSalePrice;
  let source = retailSalePrice < originalPrice ? 'sale_price' : 'base_price';
  let discountApplied = Math.max(0, originalPrice - retailSalePrice);

  const retailer = await isApprovedRetailer(user);
  const role = retailer ? 'retailer' : 'customer';
  const moq = await getProductMoq(product.id, variant?.id, user);

  // 1. Bulk Pricing Tier Check
  const bulkTiers = await query(
    `SELECT * FROM product_bulk_pricing
     WHERE product_id = ?
       AND (variant_id = ? OR variant_id IS NULL)
       AND (applies_to = 'both' OR applies_to = ?)
       AND min_qty <= ?
       AND (max_qty IS NULL OR max_qty >= ?)
       AND is_active = 1
     ORDER BY min_qty DESC, variant_id DESC LIMIT 1`,
    [product.id, variant?.id || null, role === 'retailer' ? 'retailer' : 'customer', qty, qty]
  );

  if (bulkTiers.length > 0) {
    const tier = bulkTiers[0];
    source = `bulk_tier:${tier.tier_type}`;
    if (tier.tier_type === 'percent_off') {
      discountApplied = (originalPrice * parseFloat(tier.value)) / 100;
      unitPrice = Math.max(0, originalPrice - discountApplied);
    } else if (tier.tier_type === 'flat_price') {
      unitPrice = parseFloat(tier.value);
      discountApplied = Math.max(0, originalPrice - unitPrice);
    } else if (tier.tier_type === 'flat_off') {
      discountApplied = parseFloat(tier.value);
      unitPrice = Math.max(0, originalPrice - discountApplied);
    }
  } else if (role === 'retailer' && user) {
    // 2. Per-Product Reseller Discount Override
    const customDiscount = await query(
      'SELECT * FROM reseller_product_discount WHERE reseller_id = ? AND product_id = ?',
      [user.id, product.id]
    );

    if (customDiscount.length > 0) {
      const disc = customDiscount[0];
      source = 'reseller_product_discount';
      if (disc.discount_type === 'percent') {
        const discAmt = (originalPrice * parseFloat(disc.discount_value)) / 100;
        unitPrice = Math.max(0, originalPrice - discAmt);
        discountApplied = discAmt;
      } else {
        const discAmt = parseFloat(disc.discount_value);
        unitPrice = Math.max(0, originalPrice - discAmt);
        discountApplied = discAmt;
      }
    } else {
      // 3. Global Reseller Profile Discount
      const resProfile = await query('SELECT * FROM reseller_profiles WHERE user_id = ? AND status = "approved"', [user.id]);
      if (resProfile.length > 0 && resProfile[0].has_special_price && resProfile[0].global_discount_type) {
        const profile = resProfile[0];
        source = 'reseller_global_discount';
        if (profile.global_discount_type === 'percent') {
          const discAmt = (originalPrice * parseFloat(profile.global_discount_value)) / 100;
          unitPrice = Math.max(0, originalPrice - discAmt);
          discountApplied = discAmt;
        } else {
          const discAmt = parseFloat(profile.global_discount_value);
          unitPrice = Math.max(0, originalPrice - discAmt);
          discountApplied = discAmt;
        }
      }
    }
  }

  return {
    unit_price: unitPrice,
    original_price: originalPrice,
    discount_applied: discountApplied,
    source,
    moq
  };
}

module.exports = {
  getProductMoq,
  resolvePrice,
  isApprovedRetailer
};
