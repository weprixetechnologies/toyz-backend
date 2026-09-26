const { query } = require('../../config/db');
const { getGateway, getRegisteredGateways } = require('./gateways');

async function getPaymentMethods(req, res, next) {
  try {
    const codSetting = await query("SELECT setting_value FROM settings WHERE setting_key = 'cod_enabled'");
    const isCodEnabled = codSetting.length > 0 && codSetting[0].setting_value === '1';

    const activeGateways = await query('SELECT key_name, display_name FROM payment_gateways WHERE is_active = 1');

    const methods = [];

    // Active gateways
    activeGateways.forEach((gw) => {
      methods.push({
        key_name: gw.key_name,
        display_name: gw.display_name,
        type: 'gateway',
        is_active: true
      });
    });

    // COD if enabled
    if (isCodEnabled) {
      methods.push({
        key_name: 'cod',
        display_name: 'Cash on Delivery (COD)',
        type: 'cod',
        is_active: true
      });
    }

    res.json({
      success: true,
      data: { methods }
    });
  } catch (error) {
    next(error);
  }
}

async function initiatePayment(req, res, next) {
  try {
    const { order_id, gateway_key } = req.body;
    if (!order_id || !gateway_key) {
      return res.status(400).json({ success: false, message: 'order_id and gateway_key are required' });
    }

    const orders = await query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [order_id, req.user.id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orders[0];

    const gwRecord = await query('SELECT * FROM payment_gateways WHERE key_name = ? AND is_active = 1', [gateway_key]);
    if (gwRecord.length === 0) {
      return res.status(400).json({ success: false, message: `Payment gateway '${gateway_key}' is not active` });
    }

    const gatewayInstance = getGateway(gateway_key);
    if (!gatewayInstance) {
      return res.status(400).json({ success: false, message: `Payment gateway '${gateway_key}' implementation not found` });
    }

    const initData = await gatewayInstance.initiate({
      order,
      user: req.user,
      amount: parseFloat(order.grand_total),
      currency: 'INR'
    });

    res.json({
      success: true,
      data: initData
    });
  } catch (error) {
    next(error);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const { order_id, gateway_key, payload } = req.body;
    if (!order_id || !gateway_key || !payload) {
      return res.status(400).json({ success: false, message: 'order_id, gateway_key, and payload are required' });
    }

    const gatewayInstance = getGateway(gateway_key);
    if (!gatewayInstance) {
      return res.status(400).json({ success: false, message: `Payment gateway '${gateway_key}' not found` });
    }

    const verification = await gatewayInstance.verify({ payload });
    if (!verification.success) {
      return res.status(400).json({ success: false, message: 'Payment verification failed', error: verification.error });
    }

    const orders = await query('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orders[0];

    // Log transaction
    await query(
      `INSERT INTO payment_transactions (order_id, gateway, transaction_id, status, amount, response_payload)
       VALUES (?, ?, ?, 'success', ?, ?)`,
      [order.id, gateway_key, verification.transaction_id, order.grand_total, JSON.stringify(payload)]
    );

    // Update order payment status
    await query(
      "UPDATE orders SET payment_status = 'paid', payment_gateway = ?, payment_ref = ?, paid_at = NOW() WHERE id = ?",
      [gateway_key, verification.transaction_id, order.id]
    );

    res.json({
      success: true,
      message: 'Payment verified and order updated to paid',
      data: {
        order_id: order.id,
        transaction_id: verification.transaction_id,
        payment_status: 'paid'
      }
    });
  } catch (error) {
    next(error);
  }
}

async function handleWebhook(req, res, next) {
  try {
    const { gateway } = req.params;
    const gatewayInstance = getGateway(gateway);
    if (!gatewayInstance) {
      return res.status(404).json({ success: false, message: `Gateway '${gateway}' not found` });
    }

    const webhookResult = await gatewayInstance.handleWebhook({ headers: req.headers, body: req.body });
    res.json({ success: true, message: 'Webhook processed', data: webhookResult });
  } catch (error) {
    next(error);
  }
}

// Admin Payment Gateway Management Endpoints
async function listAdminGateways(req, res, next) {
  try {
    const gateways = await query('SELECT * FROM payment_gateways ORDER BY key_name ASC');
    const registered = getRegisteredGateways();

    const result = registered.map((reg) => {
      const dbMatch = gateways.find((g) => g.key_name === reg.key_name);
      return {
        key_name: reg.key_name,
        display_name: reg.display_name,
        is_active: dbMatch ? Boolean(dbMatch.is_active) : false
      };
    });

    const codSetting = await query("SELECT setting_value FROM settings WHERE setting_key = 'cod_enabled'");
    const isCodEnabled = codSetting.length > 0 && codSetting[0].setting_value === '1';

    res.json({
      success: true,
      data: {
        gateways: result,
        cod_enabled: isCodEnabled,
        all_methods_off: !isCodEnabled && result.every((g) => !g.is_active)
      }
    });
  } catch (error) {
    next(error);
  }
}

async function toggleGateway(req, res, next) {
  try {
    const { key } = req.params;
    const { is_active } = req.body;

    const existing = await query('SELECT * FROM payment_gateways WHERE key_name = ?', [key]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: `Gateway '${key}' not registered` });
    }

    const newStatus = is_active !== undefined ? (is_active ? 1 : 0) : existing[0].is_active === 1 ? 0 : 1;
    await query('UPDATE payment_gateways SET is_active = ? WHERE key_name = ?', [newStatus, key]);

    res.json({
      success: true,
      message: `Gateway '${key}' is now ${newStatus === 1 ? 'active' : 'inactive'}`,
      data: { key_name: key, is_active: Boolean(newStatus) }
    });
  } catch (error) {
    next(error);
  }
}

async function toggleCod(req, res, next) {
  try {
    const { enabled } = req.body;
    const newValue = enabled !== undefined ? (enabled ? '1' : '0') : '1';

    await query("UPDATE settings SET setting_value = ? WHERE setting_key = 'cod_enabled'", [newValue]);

    res.json({
      success: true,
      message: `Cash on delivery (COD) is now ${newValue === '1' ? 'enabled' : 'disabled'}`,
      data: { cod_enabled: newValue === '1' }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPaymentMethods,
  initiatePayment,
  verifyPayment,
  handleWebhook,
  listAdminGateways,
  toggleGateway,
  toggleCod
};
