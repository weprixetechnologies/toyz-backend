const db = require('../../config/db');
const { getGateway, getRegisteredGateways } = require('./gateways');

async function getPaymentMethods(req, res, next) {
  try {
    const codSetting = await db.query("SELECT setting_value FROM settings WHERE setting_key = 'cod_enabled'");
    const isCodEnabled = codSetting.length > 0 && codSetting[0].setting_value === '1';

    const activeGateways = await db.query('SELECT key_name, display_name FROM payment_gateways WHERE is_active = 1');

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

    const orders = await db.query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [order_id, req.user.id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orders[0];

    const gwRecord = await db.query('SELECT * FROM payment_gateways WHERE key_name = ? AND is_active = 1', [gateway_key]);
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
      currency: 'INR',
      redirectUrl: req.body.redirect_url
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

    const orders = await db.query('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orders[0];

    // Idempotency: If order is already paid (e.g. webhook processed first), return success
    if (order.payment_status === 'paid') {
      return res.json({
        success: true,
        message: 'Payment verified and order already marked paid',
        data: {
          order_id: order.id,
          transaction_id: order.payment_ref,
          payment_status: 'paid'
        }
      });
    }

    const verification = await gatewayInstance.verify({ payload, order });

    // Handle Pending State
    if (verification.status === 'pending' || verification.state === 'PENDING') {
      return res.json({
        success: true,
        message: 'Payment is pending confirmation from gateway',
        data: {
          order_id: order.id,
          transaction_id: verification.transaction_id,
          payment_status: 'pending'
        }
      });
    }

    // Handle Failed State
    if (!verification.success) {
      try {
        await db.query(
          `INSERT INTO payment_transactions (order_id, gateway, transaction_id, status, amount, response_payload)
           VALUES (?, ?, ?, 'failed', ?, ?)`,
          [order.id, gateway_key, verification.transaction_id || `FAILED_${Date.now()}`, order.grand_total, JSON.stringify(payload)]
        );
      } catch (logErr) {
        console.warn('[verifyPayment] failed tx logging warning:', logErr.message);
      }

      return res.status(400).json({
        success: false,
        message: verification.error || 'Payment verification failed',
        data: {
          order_id: order.id,
          payment_status: 'failed',
          error: verification.error
        }
      });
    }

    // Handle Success State
    // Log transaction
    await db.query(
      `INSERT INTO payment_transactions (order_id, gateway, transaction_id, status, amount, response_payload)
       VALUES (?, ?, ?, 'success', ?, ?)`,
      [order.id, gateway_key, verification.transaction_id, order.grand_total, JSON.stringify(payload)]
    );

    // Update order payment status
    await db.query(
      "UPDATE orders SET payment_status = 'paid', payment_gateway = ?, payment_ref = ?, paid_at = NOW() WHERE id = ?",
      [gateway_key, verification.transaction_id, order.id]
    );

    // Clear cart in DB now that payment has succeeded
    if (order.user_id) {
      try {
        await db.query(
          'DELETE ci FROM cart_items ci JOIN carts c ON ci.cart_id = c.id WHERE c.user_id = ?',
          [order.user_id]
        );
      } catch (cartClearErr) {
        console.warn('[verifyPayment] Warning clearing cart after payment:', cartClearErr.message);
      }
    }

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

    const webhookResult = await gatewayInstance.handleWebhook({
      headers: req.headers,
      body: req.body,
      rawBody: req.rawBody
    });

    if (webhookResult && webhookResult.success === false) {
      return res.status(webhookResult.statusCode || 400).json({
        success: false,
        message: webhookResult.message || 'Webhook processing rejected',
        error: webhookResult.error
      });
    }

    res.json({ success: true, message: 'Webhook processed', data: webhookResult });
  } catch (error) {
    if (error.name === 'PhonePeException' || error.statusCode === 417 || error.statusCode === 401) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook credentials or callback signature',
        error: error.message
      });
    }
    next(error);
  }
}

// Admin Payment Gateway Management Endpoints
async function listAdminGateways(req, res, next) {
  try {
    const gateways = await db.query('SELECT * FROM payment_gateways ORDER BY key_name ASC');
    const registered = getRegisteredGateways();

    const result = registered.map((reg) => {
      const dbMatch = gateways.find((g) => g.key_name === reg.key_name);
      return {
        key_name: reg.key_name,
        display_name: reg.display_name,
        is_active: dbMatch ? Boolean(dbMatch.is_active) : false
      };
    });

    const codSetting = await db.query("SELECT setting_value FROM settings WHERE setting_key = 'cod_enabled'");
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

    const existing = await db.query('SELECT * FROM payment_gateways WHERE key_name = ?', [key]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: `Gateway '${key}' not registered` });
    }

    const newStatus = is_active !== undefined ? (is_active ? 1 : 0) : existing[0].is_active === 1 ? 0 : 1;
    await db.query('UPDATE payment_gateways SET is_active = ? WHERE key_name = ?', [newStatus, key]);

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

    await db.query("UPDATE settings SET setting_value = ? WHERE setting_key = 'cod_enabled'", [newValue]);

    res.json({
      success: true,
      message: `Cash on delivery (COD) is now ${newValue === '1' ? 'enabled' : 'disabled'}`,
      data: { cod_enabled: newValue === '1' }
    });
  } catch (error) {
    next(error);
  }
}

async function refundPayment(req, res, next) {
  try {
    const { order_id, gateway_key, transaction_id, amount, reason } = req.body;
    if (!order_id || !amount) {
      return res.status(400).json({ success: false, message: 'order_id and amount are required' });
    }

    const orderRows = await db.query('SELECT * FROM orders WHERE id = ?', [order_id]);
    if (orderRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const order = orderRows[0];

    const gwKey = gateway_key || order.payment_gateway;
    if (!gwKey) {
      return res.status(400).json({ success: false, message: 'Cannot determine payment gateway for order refund' });
    }

    const gatewayInstance = getGateway(gwKey);
    if (!gatewayInstance) {
      return res.status(400).json({ success: false, message: `Payment gateway '${gwKey}' not found` });
    }

    const refundResult = await gatewayInstance.refund({
      transactionId: transaction_id || order.payment_ref,
      amount: parseFloat(amount),
      reason
    });

    res.json({
      success: true,
      message: 'Refund processed successfully',
      data: refundResult
    });
  } catch (error) {
    next(error);
  }
}

async function getRefundStatus(req, res, next) {
  try {
    const { gateway, refundId } = req.params;
    const gatewayInstance = getGateway(gateway);
    if (!gatewayInstance) {
      return res.status(400).json({ success: false, message: `Payment gateway '${gateway}' not found` });
    }

    const statusResult = await gatewayInstance.getRefundStatus({ refundId, merchantRefundId: refundId });
    res.json({
      success: true,
      data: statusResult
    });
  } catch (error) {
    next(error);
  }
}

async function listTransactions(req, res, next) {
  try {
    const rows = await db.query(
      'SELECT id, order_id, gateway, transaction_id, status, amount, currency, created_at FROM payment_transactions ORDER BY created_at DESC LIMIT 100'
    );
    res.json({
      success: true,
      data: rows
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
  toggleCod,
  refundPayment,
  getRefundStatus,
  listTransactions
};
