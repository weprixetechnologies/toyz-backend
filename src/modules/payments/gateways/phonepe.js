const {
  StandardCheckoutClient,
  StandardCheckoutPayRequest,
  RefundRequest,
  Env
} = require('@phonepe-pg/pg-sdk-node');
const PaymentGateway = require('./base');
const db = require('../../../config/db');
const redisClient = require('../../../config/redis');
const eventBus = require('../../../events/bus');

class PhonePeGateway extends PaymentGateway {
  static keyName = 'phonepe';
  static displayName = 'PhonePe Payment Gateway';

  constructor(config = {}) {
    super();
    this.clientId = config.clientId || process.env.PHONEPE_CLIENT_ID || 'SANDBOX_CLIENT_ID';
    this.clientSecret = config.clientSecret || process.env.PHONEPE_CLIENT_SECRET || 'SANDBOX_CLIENT_SECRET';
    this.clientVersion = parseInt(config.clientVersion || process.env.PHONEPE_CLIENT_VERSION || '1', 10);
    this.env = (config.env || process.env.PHONEPE_ENV || 'SANDBOX').toUpperCase() === 'PRODUCTION'
      ? Env.PRODUCTION
      : Env.SANDBOX;

    this.webhookUsername = config.webhookUsername || process.env.PHONEPE_WEBHOOK_USERNAME || '';
    this.webhookPassword = config.webhookPassword || process.env.PHONEPE_WEBHOOK_PASSWORD || '';
    this.redirectUrl = config.redirectUrl || process.env.PHONEPE_REDIRECT_URL || '';
    this.frontendUrl = config.frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000';
    this.shouldPublishEvents = config.shouldPublishEvents !== undefined ? config.shouldPublishEvents : false;

    this._client = null;
  }

  getClient() {
    if (!this._client) {
      this._client = StandardCheckoutClient.getInstance(
        this.clientId,
        this.clientSecret,
        this.clientVersion,
        this.env,
        this.shouldPublishEvents
      );
    }
    return this._client;
  }

  /**
   * Initiate Standard Checkout Payment
   */
  async initiate({ order, user, amount, currency = 'INR', redirectUrl }) {
    if (!order || !order.id) {
      throw new Error('Order information is required to initiate PhonePe payment');
    }

    const client = this.getClient();

    // Unique Merchant Order ID (max 63 chars, alphanumeric + underscores)
    const merchantOrderId = `ORD_${order.id}_${Date.now()}`;
    const amountInPaisa = Math.round(Number(amount) * 100);

    // Resolve redirection URL
    let finalRedirectUrl = redirectUrl || this.redirectUrl;
    if (!finalRedirectUrl) {
      finalRedirectUrl = `${this.frontendUrl}/checkout/verify?gateway=${PhonePeGateway.keyName}&order_id=${order.id}&merchant_order_id=${merchantOrderId}`;
    } else {
      const delimiter = finalRedirectUrl.includes('?') ? '&' : '?';
      finalRedirectUrl = `${finalRedirectUrl}${delimiter}order_id=${order.id}&merchant_order_id=${merchantOrderId}&gateway=${PhonePeGateway.keyName}`;
    }

    // Build Standard Checkout Pay Request
    const payRequestBuilder = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantOrderId)
      .amount(amountInPaisa)
      .redirectUrl(finalRedirectUrl)
      .message(`Order #${order.order_number || order.id}`);

    const payRequest = payRequestBuilder.build();

    // Call PhonePe client.pay()
    const payResponse = await client.pay(payRequest);

    // Record pending transaction in existing transaction model
    try {
      await db.query(
        `INSERT INTO payment_transactions (order_id, gateway, transaction_id, status, amount, currency, response_payload)
         VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
        [
          order.id,
          PhonePeGateway.keyName,
          merchantOrderId,
          Number(amount),
          currency,
          JSON.stringify({
            phonepe_order_id: payResponse.orderId,
            merchant_order_id: merchantOrderId,
            state: payResponse.state,
            expire_at: payResponse.expireAt,
            redirect_url: payResponse.redirectUrl
          })
        ]
      );
    } catch (dbErr) {
      console.warn('[PhonePe initiate] payment_transactions insert warning:', dbErr.message);
    }

    // Return normalized response compatible with existing gateways
    return {
      gateway: PhonePeGateway.keyName,
      order_id: merchantOrderId,
      merchant_order_id: merchantOrderId,
      phonepe_order_id: payResponse.orderId,
      amount: amountInPaisa,
      currency,
      redirect_url: payResponse.redirectUrl,
      checkout_url: payResponse.redirectUrl,
      state: payResponse.state,
      expire_at: payResponse.expireAt,
      name: user?.name,
      email: user?.email,
      phone: user?.phone
    };
  }

  /**
   * Payment Status Verification using client.getOrderStatus(merchantOrderId)
   */
  async verify({ payload, order }) {
    if (!payload) {
      return { success: false, error: 'Missing PhonePe payload params' };
    }

    const merchantOrderId = payload.merchant_order_id || payload.merchantOrderId || payload.order_id || payload.transaction_id;
    if (!merchantOrderId) {
      return { success: false, error: 'merchantOrderId is required for PhonePe status verification' };
    }

    const client = this.getClient();
    let statusResponse;
    try {
      statusResponse = await client.getOrderStatus(merchantOrderId);
    } catch (err) {
      return {
        success: false,
        error: `PhonePe order status query failed: ${err.message}`,
        merchant_order_id: merchantOrderId
      };
    }

    const state = statusResponse.state; // COMPLETED, PENDING, FAILED

    if (state === 'COMPLETED') {
      return {
        success: true,
        status: 'paid',
        state: 'COMPLETED',
        transaction_id: merchantOrderId,
        phonepe_order_id: statusResponse.orderId,
        amount: statusResponse.amount ? statusResponse.amount / 100 : undefined,
        raw: statusResponse
      };
    }

    if (state === 'PENDING') {
      return {
        success: false,
        status: 'pending',
        state: 'PENDING',
        transaction_id: merchantOrderId,
        phonepe_order_id: statusResponse.orderId,
        message: 'Payment is pending confirmation from PhonePe',
        raw: statusResponse
      };
    }

    return {
      success: false,
      status: 'failed',
      state: state || 'FAILED',
      transaction_id: merchantOrderId,
      phonepe_order_id: statusResponse.orderId,
      error: statusResponse.detailedErrorCode || statusResponse.errorCode || 'Payment failed on PhonePe',
      raw: statusResponse
    };
  }

  /**
   * Webhook Integration using client.validateCallback()
   */
  async handleWebhook({ headers = {}, body = {}, rawBody = '' }) {
    const authorization = headers['authorization'] || headers['Authorization'] || headers['x-verify'] || '';
    if (!authorization) {
      return {
        success: false,
        statusCode: 401,
        message: 'Missing Authorization header in PhonePe callback'
      };
    }

    const rawBodyString = typeof rawBody === 'string' && rawBody.length > 0
      ? rawBody
      : (typeof body === 'string' ? body : JSON.stringify(body));

    const client = this.getClient();
    let callbackResponse;

    try {
      callbackResponse = client.validateCallback(
        this.webhookUsername,
        this.webhookPassword,
        authorization,
        rawBodyString
      );
    } catch (valErr) {
      return {
        success: false,
        statusCode: 400,
        message: 'Invalid webhook signature',
        error: valErr.message
      };
    }

    const payload = callbackResponse.payload || callbackResponse;
    const eventType = callbackResponse.type || (payload.merchantRefundId ? 'REFUND' : 'PAYMENT');

    // Concurrency lock / Deduplication via Redis if available
    const dedupeIdentifier = payload.orderId || payload.merchantOrderId || payload.merchantRefundId || 'unknown';
    const lockKey = `webhook:phonepe:${dedupeIdentifier}:${payload.state}`;
    let hasLock = false;

    if (redisClient && redisClient.status === 'ready') {
      try {
        const setRes = await redisClient.set(lockKey, '1', 'EX', 120, 'NX');
        if (!setRes) {
          return {
            success: true,
            message: 'Duplicate callback event received; already processed (idempotent)',
            idempotent: true,
            state: payload.state
          };
        }
        hasLock = true;
      } catch (redisErr) {
        // Fall back gracefully to database idempotency checks
      }
    }

    // ─── Case 1: Refund Event ──────────────────────────────────────────────
    if (payload.merchantRefundId || eventType === 'REFUND') {
      return await this._handleRefundWebhook(payload);
    }

    // ─── Case 2: Payment Event ─────────────────────────────────────────────
    return await this._handlePaymentWebhook(payload);
  }

  async _handlePaymentWebhook(payload) {
    const merchantOrderId = payload.merchantOrderId;
    const state = payload.state; // COMPLETED, FAILED, PENDING
    const amountInPaisa = payload.amount;

    if (!merchantOrderId) {
      return { success: false, statusCode: 400, message: 'Missing merchantOrderId in callback payload' };
    }

    // 1. Match event to existing transaction or order
    let orderId = null;
    let existingTx = null;

    try {
      const txRows = await db.query(
        'SELECT * FROM payment_transactions WHERE transaction_id = ? AND gateway = ? LIMIT 1',
        [merchantOrderId, PhonePeGateway.keyName]
      );
      if (txRows.length > 0) {
        existingTx = txRows[0];
        orderId = existingTx.order_id;
      }
    } catch (e) {
      console.warn('[PhonePe Webhook] Error querying transaction:', e.message);
    }

    // If orderId not resolved via transactions, extract from merchantOrderId (ORD_<id>_<timestamp>)
    if (!orderId && merchantOrderId.startsWith('ORD_')) {
      const parts = merchantOrderId.split('_');
      if (parts.length >= 2 && !isNaN(parts[1])) {
        orderId = parseInt(parts[1], 10);
      }
    }

    if (!orderId) {
      return {
        success: false,
        statusCode: 404,
        message: `Could not associate callback merchantOrderId '${merchantOrderId}' with any order`
      };
    }

    const orderRows = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (orderRows.length === 0) {
      return {
        success: false,
        statusCode: 404,
        message: `Order #${orderId} not found for PhonePe callback`
      };
    }

    const order = orderRows[0];

    // 2. Validate payable amount matches
    const expectedPaisa = Math.round(parseFloat(order.grand_total) * 100);
    if (amountInPaisa && Math.abs(amountInPaisa - expectedPaisa) > 1) {
      console.error(`[PhonePe Webhook] Amount mismatch: received ${amountInPaisa} paisa, expected ${expectedPaisa} paisa`);
      return {
        success: false,
        statusCode: 400,
        message: `Amount mismatch: expected ₹${order.grand_total}, got ₹${amountInPaisa / 100}`
      };
    }

    // 3. Idempotency: prevent duplicate order fulfillment
    if (order.payment_status === 'paid' && state === 'COMPLETED') {
      return {
        success: true,
        message: 'Order already fulfilled and marked paid (idempotent)',
        order_id: order.id,
        state
      };
    }

    // 4. Update status according to PhonePe state
    if (state === 'COMPLETED') {
      // Update transaction log
      if (existingTx) {
        await db.query(
          'UPDATE payment_transactions SET status = ?, response_payload = ?, updated_at = NOW() WHERE id = ?',
          ['success', JSON.stringify(payload), existingTx.id]
        );
      } else {
        await db.query(
          `INSERT INTO payment_transactions (order_id, gateway, transaction_id, status, amount, response_payload)
           VALUES (?, ?, ?, 'success', ?, ?)`,
          [order.id, PhonePeGateway.keyName, merchantOrderId, order.grand_total, JSON.stringify(payload)]
        );
      }

      // Mark order paid
      await db.query(
        "UPDATE orders SET payment_status = 'paid', payment_gateway = ?, payment_ref = ?, paid_at = NOW() WHERE id = ?",
        [PhonePeGateway.keyName, merchantOrderId, order.id]
      );

      // Trigger event bus
      eventBus.emit('payment.success', {
        orderId: order.id,
        gateway: PhonePeGateway.keyName,
        transactionId: merchantOrderId,
        amount: order.grand_total
      });

      return {
        success: true,
        message: 'Payment callback processed; order marked paid',
        order_id: order.id,
        state: 'COMPLETED'
      };
    }

    if (state === 'FAILED') {
      if (existingTx) {
        await db.query(
          'UPDATE payment_transactions SET status = ?, response_payload = ?, updated_at = NOW() WHERE id = ?',
          ['failed', JSON.stringify(payload), existingTx.id]
        );
      } else {
        await db.query(
          `INSERT INTO payment_transactions (order_id, gateway, transaction_id, status, amount, response_payload)
           VALUES (?, ?, ?, 'failed', ?, ?)`,
          [order.id, PhonePeGateway.keyName, merchantOrderId, order.grand_total, JSON.stringify(payload)]
        );
      }

      if (order.payment_status === 'pending') {
        await db.query("UPDATE orders SET payment_status = 'failed' WHERE id = ?", [order.id]);
      }

      return {
        success: true,
        message: 'Payment failure recorded',
        order_id: order.id,
        state: 'FAILED'
      };
    }

    // PENDING state
    return {
      success: true,
      message: 'Payment is pending on PhonePe',
      order_id: order.id,
      state: 'PENDING'
    };
  }

  async _handleRefundWebhook(payload) {
    const merchantRefundId = payload.merchantRefundId;
    const originalMerchantOrderId = payload.originalMerchantOrderId;
    const state = payload.state; // COMPLETED, FAILED, PENDING

    if (!merchantRefundId) {
      return { success: false, statusCode: 400, message: 'Missing merchantRefundId in refund callback' };
    }

    const txRows = await db.query(
      'SELECT * FROM payment_transactions WHERE transaction_id = ? AND gateway = ? LIMIT 1',
      [merchantRefundId, PhonePeGateway.keyName]
    );

    const txStatus = state === 'COMPLETED' ? 'refunded' : (state === 'FAILED' ? 'failed' : 'pending');

    if (txRows.length > 0) {
      await db.query(
        'UPDATE payment_transactions SET status = ?, response_payload = ?, updated_at = NOW() WHERE id = ?',
        [txStatus, JSON.stringify(payload), txRows[0].id]
      );

      if (state === 'COMPLETED') {
        await db.query(
          "UPDATE orders SET payment_status = 'refunded', status = 'refunded' WHERE id = ?",
          [txRows[0].order_id]
        );
      }

      return {
        success: true,
        message: `Refund callback processed (${state})`,
        refund_id: merchantRefundId,
        order_id: txRows[0].order_id,
        state
      };
    }

    return {
      success: true,
      message: `Refund callback received for ${merchantRefundId}`,
      state
    };
  }

  /**
   * Refund Initiation using official RefundRequest.builder()
   */
  async refund({ transactionId, amount, reason }) {
    if (!transactionId) {
      throw new Error('transactionId is required to initiate a refund');
    }
    const refundAmount = Number(amount);
    if (!refundAmount || refundAmount <= 0) {
      throw new Error('Valid refund amount is required');
    }

    // Lookup original transaction in payment_transactions
    let txRows = await db.query(
      'SELECT * FROM payment_transactions WHERE transaction_id = ? AND gateway = ? LIMIT 1',
      [transactionId, PhonePeGateway.keyName]
    );

    let order = null;
    let originalMerchantOrderId = transactionId;

    if (txRows.length > 0) {
      const orderRows = await db.query('SELECT * FROM orders WHERE id = ?', [txRows[0].order_id]);
      if (orderRows.length > 0) order = orderRows[0];
    } else {
      // Try searching orders by payment_ref or id
      const orderRows = await db.query(
        'SELECT * FROM orders WHERE payment_ref = ? OR id = ? LIMIT 1',
        [transactionId, transactionId]
      );
      if (orderRows.length > 0) {
        order = orderRows[0];
        originalMerchantOrderId = order.payment_ref || transactionId;
      }
    }

    if (!order) {
      throw new Error(`Original order for transaction '${transactionId}' could not be found`);
    }

    // Validate refund amount against grand total and previous refunds
    const prevRefunds = await db.query(
      "SELECT COALESCE(SUM(amount), 0) AS total_refunded FROM payment_transactions WHERE order_id = ? AND status IN ('refunded', 'success') AND transaction_id LIKE 'REF_%'",
      [order.id]
    );
    const totalAlreadyRefunded = parseFloat(prevRefunds[0]?.total_refunded || '0');
    const orderTotal = parseFloat(order.grand_total);

    if (totalAlreadyRefunded + refundAmount > orderTotal + 0.01) {
      throw new Error(`Refund amount ₹${refundAmount} exceeds max refundable balance ₹${(orderTotal - totalAlreadyRefunded).toFixed(2)}`);
    }

    // Prevent duplicate active refunds: check if a refund is already pending
    const pendingRefunds = await db.query(
      "SELECT * FROM payment_transactions WHERE order_id = ? AND status = 'pending' AND transaction_id LIKE 'REF_%'",
      [order.id]
    );
    if (pendingRefunds.length > 0) {
      throw new Error('A refund is already pending for this order. Please wait for completion.');
    }

    const merchantRefundId = `REF_${order.id}_${Date.now()}`;
    const amountInPaisa = Math.round(refundAmount * 100);

    const client = this.getClient();
    const refundRequestBuilder = RefundRequest.builder()
      .merchantRefundId(merchantRefundId)
      .originalMerchantOrderId(originalMerchantOrderId)
      .amount(amountInPaisa);

    const refundRequest = refundRequestBuilder.build();
    const refundResponse = await client.refund(refundRequest);

    const refundState = refundResponse.state; // COMPLETED, PENDING, FAILED
    const initialTxStatus = refundState === 'COMPLETED' ? 'refunded' : (refundState === 'PENDING' ? 'pending' : 'failed');

    // Store refund transaction in existing model
    await db.query(
      `INSERT INTO payment_transactions (order_id, gateway, transaction_id, status, amount, currency, response_payload)
       VALUES (?, ?, ?, ?, ?, 'INR', ?)`,
      [
        order.id,
        PhonePeGateway.keyName,
        merchantRefundId,
        initialTxStatus,
        refundAmount,
        JSON.stringify(refundResponse)
      ]
    );

    if (refundState === 'COMPLETED') {
      await db.query(
        "UPDATE orders SET payment_status = 'refunded', status = 'refunded' WHERE id = ?",
        [order.id]
      );
    }

    return {
      success: refundState === 'COMPLETED' || refundState === 'PENDING',
      state: refundState,
      refund_id: refundResponse.refundId || merchantRefundId,
      merchant_refund_id: merchantRefundId,
      original_order_id: originalMerchantOrderId,
      amount: refundAmount,
      raw: refundResponse
    };
  }

  /**
   * Refund Status Verification using client.getRefundStatus(merchantRefundId)
   */
  async getRefundStatus({ refundId, merchantRefundId }) {
    const idToQuery = merchantRefundId || refundId;
    if (!idToQuery) {
      throw new Error('merchantRefundId or refundId is required to check refund status');
    }

    const client = this.getClient();
    const refundStatusResponse = await client.getRefundStatus(idToQuery);

    const state = refundStatusResponse.state; // COMPLETED, PENDING, FAILED
    const mappedStatus = state === 'COMPLETED' ? 'refunded' : (state === 'FAILED' ? 'failed' : 'pending');

    try {
      await db.query(
        'UPDATE payment_transactions SET status = ?, response_payload = ?, updated_at = NOW() WHERE transaction_id = ? AND gateway = ?',
        [mappedStatus, JSON.stringify(refundStatusResponse), idToQuery, PhonePeGateway.keyName]
      );

      if (state === 'COMPLETED') {
        const txRows = await db.query(
          'SELECT order_id FROM payment_transactions WHERE transaction_id = ? LIMIT 1',
          [idToQuery]
        );
        if (txRows.length > 0) {
          await db.query(
            "UPDATE orders SET payment_status = 'refunded', status = 'refunded' WHERE id = ?",
            [txRows[0].order_id]
          );
        }
      }
    } catch (dbErr) {
      console.warn('[PhonePe getRefundStatus] DB update warning:', dbErr.message);
    }

    return {
      success: state === 'COMPLETED',
      state,
      refund_id: refundStatusResponse.paymentDetails?.[0]?.refundId || idToQuery,
      merchant_refund_id: refundStatusResponse.merchantRefundId || idToQuery,
      amount: refundStatusResponse.amount ? refundStatusResponse.amount / 100 : undefined,
      raw: refundStatusResponse
    };
  }
}

module.exports = PhonePeGateway;
