const eventBus = require('../bus');
const { query } = require('../../config/db');

function registerLowStockListeners() {
  eventBus.on('inventory.adjusted', async (data) => {
    try {
      const { product_id, variant_id, qty_after } = data;
      if (!product_id) return;

      const products = await query('SELECT name, sku, low_stock_threshold FROM products WHERE id = ?', [product_id]);
      if (products.length === 0) return;

      const product = products[0];
      const threshold = product.low_stock_threshold || 5;

      if (qty_after <= threshold) {
        console.log(`[LowStockListener] Product '${product.name}' stock (${qty_after}) <= threshold (${threshold}). Creating alert.`);

        await query(
          'INSERT INTO low_stock_alerts (product_id, variant_id, stock_at, threshold) VALUES (?, ?, ?, ?)',
          [product_id, variant_id || null, qty_after, threshold]
        );

        eventBus.emit('stock.low', {
          product_name: product.name,
          sku: product.sku,
          qty: qty_after,
          threshold
        });
      }
    } catch (error) {
      console.error('[LowStockListener Error]:', error.message);
    }
  });

  eventBus.on('stock.low', async (data) => {
    try {
      console.log(`[LowStockListener] Handling 'stock.low' for product ${data.product_name}`);
      const { sendSms } = require('../../utils/smsService');
      const storeEmail = await query("SELECT setting_value FROM settings WHERE setting_key = 'store_email'");

      await sendSms({
        phone: '9876543210', // Admin notification phone
        templateId: 'stock_low',
        variables: {
          product_name: data.product_name,
          sku: data.sku || 'N/A',
          qty: data.qty
        }
      });
    } catch (error) {
      console.error('[LowStock SMS Listener Error]:', error.message);
    }
  });
}

module.exports = registerLowStockListeners;
