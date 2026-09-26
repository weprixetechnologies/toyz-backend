const bus = require('../bus');
const affiliateService = require('../../modules/affiliates/affiliateService');
const db = require('../../config/db');

function registerAffiliateListeners() {
  bus.on('order.placed', async (data) => {
    try {
      const orderId = typeof data === 'object' ? data.orderId || data.id : data;
      const refCode = typeof data === 'object' ? (data.refCode || data.ref_code) : null;

      const orders = await db.query('SELECT status, ref_code FROM orders WHERE id = ?', [orderId]);
      if (!orders || orders.length === 0) return;

      const order = orders[0];
      // Skip if reseller order requiring approval (will calculate when order.approved fires)
      if (order.status === 'pending_approval') return;

      await affiliateService.calculateCommissionForOrder(orderId, refCode || order.ref_code);
    } catch (error) {
      console.warn('[AffiliateListener] Error processing order.placed:', error.message);
    }
  });

  bus.on('order.approved', async (data) => {
    try {
      const orderId = typeof data === 'object' ? data.orderId || data.id : data;
      const orders = await db.query('SELECT ref_code FROM orders WHERE id = ?', [orderId]);
      if (!orders || orders.length === 0) return;

      await affiliateService.calculateCommissionForOrder(orderId, orders[0].ref_code);
    } catch (error) {
      console.warn('[AffiliateListener] Error processing order.approved:', error.message);
    }
  });
}

module.exports = registerAffiliateListeners;
