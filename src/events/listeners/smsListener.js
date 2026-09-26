const eventBus = require('../bus');
const { sendSms } = require('../../utils/smsService');

function registerSmsListeners() {
  eventBus.on('order.placed', async (orderData) => {
    try {
      console.log(`[SMS Listener] Handling 'order.placed' for order ${orderData.order_number}`);
      await sendSms({
        phone: orderData.shipping_phone || orderData.user_phone,
        templateId: 'order_placed',
        variables: {
          name: orderData.shipping_name || 'Customer',
          order_number: orderData.order_number,
          amount: `₹${orderData.grand_total}`,
          link: `http://localhost:3000/account/orders/${orderData.id}`
        }
      });
    } catch (error) {
      console.error('[SMS Listener Error]:', error.message);
    }
  });

  eventBus.on('reseller.approved', async (data) => {
    try {
      console.log(`[SMS Listener] Handling 'reseller.approved' for reseller ${data.name}`);
      await sendSms({
        phone: data.phone || '9876543210',
        templateId: 'reseller_approval',
        variables: {
          name: data.name
        }
      });
    } catch (error) {
      console.error('[SMS Listener Error]:', error.message);
    }
  });

  eventBus.on('order.approved', async (data) => {
    try {
      console.log(`[SMS Listener] Handling 'order.approved' for reseller order ${data.order_number}`);
      await sendSms({
        phone: data.phone || '9876543210',
        templateId: 'order_approved',
        variables: {
          name: data.name,
          order_number: data.order_number,
          items_summary: data.items_summary
        }
      });
    } catch (error) {
      console.error('[SMS Listener Error]:', error.message);
    }
  });
}

module.exports = registerSmsListeners;
