const db = require('../../config/db');

class AffiliateService {
  /**
   * Register a user as an affiliate
   */
  async registerAffiliate(userId, data = {}) {
    const { referralCode, bankName, accountNumber, ifsc, upiId } = data;

    // Check if user exists
    const users = await db.query('SELECT id, role FROM users WHERE id = ?', [userId]);
    if (!users || users.length === 0) {
      throw new Error('User not found.');
    }

    // Check if already an affiliate
    const existing = await db.query('SELECT id FROM affiliate_profiles WHERE user_id = ?', [userId]);
    if (existing && existing.length > 0) {
      throw new Error('User is already registered as an affiliate.');
    }

    // Generate referral code if not provided
    let refCode = referralCode ? referralCode.trim().toLowerCase() : null;
    if (!refCode) {
      refCode = 'ref_' + Math.random().toString(36).substring(2, 10);
    }

    // Check uniqueness of referral code
    const codeMatch = await db.query('SELECT id FROM affiliate_profiles WHERE referral_code = ?', [refCode]);
    if (codeMatch && codeMatch.length > 0) {
      throw new Error('Referral code is already taken. Please choose another.');
    }

    // Fetch default commission rate from settings
    const settings = await db.query(
      `SELECT setting_value FROM settings WHERE setting_key = 'affiliate_default_commission_pct'`
    );
    const defaultPct = (settings && settings.length > 0) ? parseFloat(settings[0].setting_value) || 5.0 : 5.0;

    const result = await db.query(
      `INSERT INTO affiliate_profiles 
       (user_id, referral_code, commission_type, commission_value, bank_name, account_number, ifsc, upi_id, status)
       VALUES (?, ?, 'percent', ?, ?, ?, ?, ?, 'active')`,
      [userId, refCode, defaultPct, bankName || null, accountNumber || null, ifsc || null, upiId || null]
    );

    const profile = await db.query('SELECT * FROM affiliate_profiles WHERE id = ?', [result.insertId]);
    return profile[0];
  }

  /**
   * Get affiliate profile for a user
   */
  async getProfileByUserId(userId) {
    const rows = await db.query('SELECT * FROM affiliate_profiles WHERE user_id = ?', [userId]);
    return (rows && rows.length > 0) ? rows[0] : null;
  }

  /**
   * Track referral link click
   */
  async trackClick({ refCode, ipAddress, userAgent, landingUrl }) {
    if (!refCode) return null;
    const cleanCode = refCode.trim().toLowerCase();

    const profiles = await db.query(
      `SELECT id FROM affiliate_profiles WHERE referral_code = ? AND status = 'active'`,
      [cleanCode]
    );
    if (!profiles || profiles.length === 0) return null;

    const affiliateId = profiles[0].id;

    // Log click
    const result = await db.query(
      `INSERT INTO affiliate_clicks (affiliate_id, ref_code, ip_address, user_agent, landing_url)
       VALUES (?, ?, ?, ?, ?)`,
      [affiliateId, cleanCode, ipAddress || null, userAgent || null, landingUrl || null]
    );

    // Update total_clicks
    await db.query(`UPDATE affiliate_profiles SET total_clicks = total_clicks + 1 WHERE id = ?`, [affiliateId]);

    return { clickId: result.insertId, affiliateId, refCode: cleanCode };
  }

  /**
   * Calculate commission for an order
   */
  async calculateCommissionForOrder(orderId, refCode = null) {
    // Fetch order details
    const orders = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!orders || orders.length === 0) return null;
    const order = orders[0];

    const attributionCode = refCode || order.ref_code;
    if (!attributionCode) return null;

    // Find active affiliate
    const profiles = await db.query(
      `SELECT * FROM affiliate_profiles WHERE referral_code = ? AND status = 'active'`,
      [attributionCode.trim().toLowerCase()]
    );
    if (!profiles || profiles.length === 0) return null;

    const affiliate = profiles[0];

    // Don't award commission if user buys through their own affiliate link
    if (affiliate.user_id === order.user_id) {
      return null;
    }

    // Fetch order items
    const items = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
    if (!items || items.length === 0) return null;

    let totalCommission = 0;

    for (const item of items) {
      const itemQty = item.qty_approved !== null && item.qty_approved !== undefined ? item.qty_approved : item.qty_ordered || item.qty || 1;
      if (itemQty <= 0) continue;
      const unitPrice = parseFloat(item.unit_price || item.price || 0);
      const itemSubtotal = unitPrice * itemQty;

      // Tier Resolution: product tier -> category tier -> affiliate default -> global default
      let commType = affiliate.commission_type;
      let commVal = parseFloat(affiliate.commission_value);

      // 1. Check Product Tier
      const prodTiers = await db.query(
        `SELECT commission_type, commission_value FROM affiliate_commission_tiers
         WHERE (affiliate_id = ? OR affiliate_id IS NULL) AND product_id = ?
         ORDER BY affiliate_id DESC LIMIT 1`,
        [affiliate.id, item.product_id]
      );

      if (prodTiers && prodTiers.length > 0) {
        commType = prodTiers[0].commission_type;
        commVal = parseFloat(prodTiers[0].commission_value);
      } else {
        // 2. Check Category Tier
        const products = await db.query('SELECT category_id FROM products WHERE id = ?', [item.product_id]);
        if (products && products.length > 0 && products[0].category_id) {
          const catTiers = await db.query(
            `SELECT commission_type, commission_value FROM affiliate_commission_tiers
             WHERE (affiliate_id = ? OR affiliate_id IS NULL) AND category_id = ?
             ORDER BY affiliate_id DESC LIMIT 1`,
            [affiliate.id, products[0].category_id]
          );
          if (catTiers && catTiers.length > 0) {
            commType = catTiers[0].commission_type;
            commVal = parseFloat(catTiers[0].commission_value);
          }
        }
      }

      // Compute amount
      let itemComm = 0;
      if (commType === 'percent') {
        itemComm = (itemSubtotal * commVal) / 100;
      } else {
        itemComm = commVal * itemQty;
      }
      itemComm = Math.round(itemComm * 100) / 100;

      if (itemComm > 0) {
        totalCommission += itemComm;
        // Insert commission record
        await db.query(
          `INSERT INTO affiliate_commissions (affiliate_id, order_id, order_item_id, amount, status)
           VALUES (?, ?, ?, ?, 'pending')`,
          [affiliate.id, orderId, item.id, itemComm]
        );
      }
    }

    if (totalCommission > 0) {
      // Update affiliate stats
      await db.query(
        `UPDATE affiliate_profiles 
         SET total_conversions = total_conversions + 1,
             total_earned = total_earned + ?
         WHERE id = ?`,
        [totalCommission, affiliate.id]
      );

      // Mark click converted if any
      await db.query(
        `UPDATE affiliate_clicks 
         SET converted = 1, order_id = ? 
         WHERE ref_code = ? AND converted = 0 
         ORDER BY id DESC LIMIT 1`,
        [orderId, affiliate.referral_code]
      );
    }

    return { affiliateId: affiliate.id, totalCommission };
  }

  /**
   * Request payout
   */
  async requestPayout(userId, amount, method) {
    const profile = await this.getProfileByUserId(userId);
    if (!profile) {
      throw new Error('Affiliate profile not found.');
    }

    if (profile.status !== 'active') {
      throw new Error('Affiliate account is suspended or inactive.');
    }

    const requestedAmount = parseFloat(amount);
    if (isNaN(requestedAmount) || requestedAmount <= 0) {
      throw new Error('Invalid payout amount.');
    }

    // Check available balance
    const available = parseFloat(profile.total_earned) - parseFloat(profile.total_paid);

    // Subtract existing pending payout requests
    const pendingPayouts = await db.query(
      `SELECT SUM(amount) AS pending_total FROM affiliate_payouts 
       WHERE affiliate_id = ? AND status IN ('requested', 'processing')`,
      [profile.id]
    );

    const pendingTotal = (pendingPayouts && pendingPayouts[0]?.pending_total) ? parseFloat(pendingPayouts[0].pending_total) : 0;
    const netAvailable = available - pendingTotal;

    if (requestedAmount > netAvailable) {
      throw new Error(`Insufficient affiliate balance. Available: ₹${netAvailable.toFixed(2)}`);
    }

    const result = await db.query(
      `INSERT INTO affiliate_payouts (affiliate_id, amount, method, status)
       VALUES (?, ?, ?, 'requested')`,
      [profile.id, requestedAmount, method || 'upi']
    );

    return { payoutId: result.insertId, amount: requestedAmount, status: 'requested' };
  }

  /**
   * Get commissions log for an affiliate user
   */
  async getCommissions(userId) {
    const profile = await this.getProfileByUserId(userId);
    if (!profile) return [];

    const commissions = await db.query(
      `SELECT ac.*, o.order_number, o.created_at AS order_date
       FROM affiliate_commissions ac
       JOIN orders o ON ac.order_id = o.id
       WHERE ac.affiliate_id = ?
       ORDER BY ac.id DESC`,
      [profile.id]
    );
    return commissions || [];
  }

  /**
   * Get payouts for an affiliate user
   */
  async getPayouts(userId) {
    const profile = await this.getProfileByUserId(userId);
    if (!profile) return [];

    const payouts = await db.query(
      `SELECT * FROM affiliate_payouts WHERE affiliate_id = ? ORDER BY id DESC`,
      [profile.id]
    );
    return payouts || [];
  }

  /**
   * Admin: List all affiliates
   */
  async adminListAffiliates() {
    const affiliates = await db.query(
      `SELECT ap.*, u.name AS full_name, u.email, u.phone
       FROM affiliate_profiles ap
       JOIN users u ON ap.user_id = u.id
       ORDER BY ap.id DESC`
    );
    return affiliates || [];
  }

  /**
   * Admin: Get single affiliate detail with tiers & stats
   */
  async adminGetAffiliate(affiliateId) {
    const profiles = await db.query(
      `SELECT ap.*, u.name AS full_name, u.email, u.phone
       FROM affiliate_profiles ap
       JOIN users u ON ap.user_id = u.id
       WHERE ap.id = ?`,
      [affiliateId]
    );
    if (!profiles || profiles.length === 0) return null;

    const tiers = await db.query(
      `SELECT act.*, c.name AS category_name, p.title AS product_title
       FROM affiliate_commission_tiers act
       LEFT JOIN categories c ON act.category_id = c.id
       LEFT JOIN products p ON act.product_id = p.id
       WHERE act.affiliate_id = ?`,
      [affiliateId]
    );

    return { ...profiles[0], custom_tiers: tiers || [] };
  }

  /**
   * Admin: Set commission tier for affiliate
   */
  async adminSetCommissionTier(affiliateId, { categoryId, productId, commissionType, commissionValue }) {
    const result = await db.query(
      `INSERT INTO affiliate_commission_tiers (affiliate_id, category_id, product_id, commission_type, commission_value)
       VALUES (?, ?, ?, ?, ?)`,
      [affiliateId || null, categoryId || null, productId || null, commissionType, commissionValue]
    );
    return { tierId: result.insertId };
  }

  /**
   * Admin: Update affiliate status
   */
  async adminUpdateStatus(affiliateId, status) {
    if (!['active', 'suspended', 'pending'].includes(status)) {
      throw new Error('Invalid status value.');
    }
    await db.query(`UPDATE affiliate_profiles SET status = ? WHERE id = ?`, [status, affiliateId]);
    return { affiliateId, status };
  }

  /**
   * Admin: List all payout requests
   */
  async adminListPayouts() {
    const payouts = await db.query(
      `SELECT ap.*, prof.referral_code, u.name AS full_name, u.email, u.phone
       FROM affiliate_payouts ap
       JOIN affiliate_profiles prof ON ap.affiliate_id = prof.id
       JOIN users u ON prof.user_id = u.id
       ORDER BY ap.id DESC`
    );
    return payouts || [];
  }

  /**
   * Admin: Process payout request
   */
  async adminProcessPayout(payoutId, status, adminNote, adminUserId) {
    if (!['processing', 'paid', 'rejected'].includes(status)) {
      throw new Error('Invalid status for payout processing.');
    }

    const payouts = await db.query('SELECT * FROM affiliate_payouts WHERE id = ?', [payoutId]);
    if (!payouts || payouts.length === 0) {
      throw new Error('Payout request not found.');
    }

    const payout = payouts[0];
    if (payout.status === 'paid') {
      throw new Error('Payout has already been marked as paid.');
    }

    await db.query(
      `UPDATE affiliate_payouts 
       SET status = ?, admin_note = ?, processed_by = ?, processed_at = NOW() 
       WHERE id = ?`,
      [status, adminNote || null, adminUserId, payoutId]
    );

    if (status === 'paid') {
      // Update total_paid on affiliate profile
      await db.query(
        `UPDATE affiliate_profiles SET total_paid = total_paid + ? WHERE id = ?`,
        [payout.amount, payout.affiliate_id]
      );

      // Update linked pending commissions to 'paid'
      await db.query(
        `UPDATE affiliate_commissions 
         SET status = 'paid', payout_id = ? 
         WHERE affiliate_id = ? AND status = 'pending'`,
        [payoutId, payout.affiliate_id]
      );
    }

    return { payoutId, status };
  }
}

module.exports = new AffiliateService();
