const PaymentGateway = require('./base');
const db = require('../../../config/db');
const redisClient = require('../../../config/redis');
const eventBus = require('../../../events/bus');
const {
  generateBase64Payload,
  decodeBase64Payload,
  generatePaymentChecksum,
  generateStatusChecksum,
  generateRefundChecksum,
  verifyCallbackChecksum,
  validateMobileNumber
} = require('./phonepeUtils');

/**
 * PhonePe V1 Standard Checkout Gateway Implementation
 * 
 * Replaces the V2 SDK integration with the legacy PhonePe V1 Standard Checkout API
 * using native Node.js HTTP requests and native crypto.
 */
class PhonePeGateway extends PaymentGateway {
  static keyName = 'phonepe';
  static displayName = 'PhonePe Payment Gateway';

  constructor(config = {}) {
    super();
    this.merchantId = config.merchantId || process.env.PHONEPE_MERCHANT_ID || 'PGTESTPAYUAT';
    this.saltKey = config.saltKey || process.env.PHONEPE_SALT_KEY || '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
    this.saltIndex = String(config.saltIndex || process.env.PHONEPE_SALT_INDEX || '1');
    this.env = (config.env || process.env.PHONEPE_ENV || 'SANDBOX').toUpperCase();

    this.redirectUrl = config.redirectUrl || process.env.PHONEPE_REDIRECT_URL || '';
    this.callbackUrl = config.callbackUrl || process.env.PHONEPE_CALLBACK_URL || process.env.PHONEPE_WEBHOOK_URL || '';
    this.frontendUrl = config.frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000';
  }

  /**
   * Determine PhonePe V1 API Base URL
   */
  getBaseUrl() {
    if (this.env === 'PRODUCTION') {
      return 'https://api.phonepe.com/apis/hermes';
    }
    return 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  }

  /**
   * Production Safety Guard
   * Prevents accidental execution of test/sandbox credentials against production
   */
  _assertProductionSafety() {
    if (this.env === 'PRODUCTION') {
      const isTestMerchant = this.merchantId.startsWith('PGTEST') || this.merchantId.includes('TEST');
      const isTestSalt = this.saltKey.includes('099eb0cd') || this.saltKey.includes('96434309');
      if (isTestMerchant || isTestSalt) {
        throw new Error('[PhonePe Safety Guard] Sandbox UAT credentials cannot be used in PRODUCTION environment');
      }
    }
  }

  /**
   * 1. Initiate PhonePe V1 Standard Checkout Payment
   * Endpoint: POST /pg/v1/pay
   */
  async initiate({ order, user, amount, currency = 'INR', redirectUrl }) {
    if (!order || !order.id) {
      throw new Error('Order information is required to initiate PhonePe payment');
    }

    this._assertProductionSafety();

    const merchantTransactionId = `MT_${order.id}_${Date.now()}`;
    const merchantUserId = `UID_${user?.id || order.user_id || order.id}`;
    const amountInPaisa = Math.round(Number(amount) * 100);

    // Resolve redirection URL (appends tracking parameters)
    let finalRedirectUrl = redirectUrl || this.redirectUrl;
    if (!finalRedirectUrl) {
      finalRedirectUrl = `${this.frontendUrl}/checkout/verify?gateway=${PhonePeGateway.keyName}&order_id=${order.id}&merchant_order_id=${merchantTransactionId}`;
    } else {
      const delimiter = finalRedirectUrl.includes('?') ? '&' : '?';
      finalRedirectUrl = `${finalRedirectUrl}${delimiter}order_id=${order.id}&merchant_order_id=${merchantTransactionId}&gateway=${PhonePeGateway.keyName}`;
    }

    // Resolve callback URL for backend server-to-server notifications
    const callbackUrl = this.callbackUrl || `${this.frontendUrl}/api/v1/payments/webhook/phonepe`;

    // Construct V1 payload
    const v1Payload = {
      merchantId: this.merchantId,
      merchantTransactionId,
      merchantUserId,
      amount: amountInPaisa,
      redirectUrl: finalRedirectUrl,
      redirectMode: 'REDIRECT',
      callbackUrl,
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    };

    // Mobile number validation and formatting
    const rawMobile = user?.phone || order.shipping_phone || order.phone;
    const validatedMobile = validateMobileNumber(rawMobile);
    if (validatedMobile) {
      v1Payload.mobileNumber = validatedMobile;
    }

    // Encode payload & calculate checksum
    const base64Payload = generateBase64Payload(v1Payload);
    const checksum = generatePaymentChecksum(base64Payload, this.saltKey, this.saltIndex);

    const endpointUrl = `${this.getBaseUrl()}/pg/v1/pay`;

    let responseData;
    try {
      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'accept': 'application/json'
        },
        body: JSON.stringify({ request: base64Payload })
      });
      responseData = await res.json();
    } catch (networkErr) {
      throw new Error(`PhonePe payment initiation request failed: ${networkErr.message}`);
    }

    if (!responseData || !responseData.success) {
      const errMsg = responseData?.message || responseData?.code || 'PhonePe payment initiation rejected';
      throw new Error(`PhonePe Payment Initiation Error (${responseData?.code || 'UNKNOWN'}): ${errMsg}`);
    }

    // Extract redirect payment URL from instrumentResponse
    const paymentUrl = responseData.data?.instrumentResponse?.redirectInfo?.url;
    if (!paymentUrl) {
      throw new Error('PhonePe did not return a valid instrument redirect URL');
    }

    // Record pending transaction in existing transaction model
    try {
      await db.query(
        `INSERT INTO payment_transactions (order_id, gateway, transaction_id, status, amount, currency, response_payload)
         VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
        [
          order.id,
          PhonePeGateway.keyName,
          merchantTransactionId,
          Number(amount),
          currency,
          JSON.stringify({
            merchant_transaction_id: merchantTransactionId,
            phonepe_response: responseData
          })
        ]
      );
    } catch (dbErr) {
      console.warn('[PhonePe initiate] payment_transactions insert warning:', dbErr.message);
    }

    // Return normalized response compatible with existing gateways
    return {
      gateway: PhonePeGateway.keyName,
      order_id: merchantTransactionId,
      merchant_order_id: merchantTransactionId,
      phonepe_order_id: responseData.data?.transactionId || merchantTransactionId,
      amount: amountInPaisa,
      currency,
      redirect_url: paymentUrl,
      checkout_url: paymentUrl,
      state: responseData.code,
      name: user?.name,
      email: user?.email,
      phone: user?.phone
    };
  }

  /**
   * Query PhonePe V1 Server-to-Server Order Status API
   * Endpoint: GET /pg/v1/status/{merchantId}/{merchantTransactionId}
   */
  async checkPaymentStatus(merchantTransactionId) {
    if (!merchantTransactionId) {
      throw new Error('merchantTransactionId is required to query status');
    }

    const checksum = generateStatusChecksum(
      this.merchantId,
      merchantTransactionId,
      this.saltKey,
      this.saltIndex
    );

    const url = `${this.getBaseUrl()}/pg/v1/status/${this.merchantId}/${merchantTransactionId}`;

    let responseData;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'X-MERCHANT-ID': this.merchantId,
          'accept': 'application/json'
        }
      });
      responseData = await res.json();
    } catch (networkErr) {
      return {
        success: false,
        status: 'pending',
        state: 'PENDING',
        transaction_id: merchantTransactionId,
        error: `PhonePe status request failed: ${networkErr.message}`
      };
    }

    return responseData;
  }

  /**
   * 2. Payment Status Verification
   * Called by backend /payments/verify controller
   */
  async verify({ payload, order }) {
    if (!payload && !order) {
      return { success: false, error: 'Missing PhonePe verification payload' };
    }

    let merchantTransactionId = payload?.merchant_order_id ||
      payload?.merchantOrderId ||
      payload?.merchantTransactionId ||
      payload?.transaction_id ||
      payload?.order_id;

    // If merchantTransactionId appears to be a numeric order ID or missing, resolve from payment_transactions
    if (!merchantTransactionId || !String(merchantTransactionId).startsWith('MT_')) {
      const orderIdToLookup = order?.id || payload?.order_id;
      if (orderIdToLookup) {
        try {
          const txRows = await db.query(
            "SELECT transaction_id FROM payment_transactions WHERE order_id = ? AND gateway = ? ORDER BY id DESC LIMIT 1",
            [orderIdToLookup, PhonePeGateway.keyName]
          );
          if (txRows.length > 0 && txRows[0].transaction_id) {
            merchantTransactionId = txRows[0].transaction_id;
          }
        } catch (dbErr) {
          console.warn('[PhonePe verify] resolving transaction_id warning:', dbErr.message);
        }
      }
    }

    if (!merchantTransactionId) {
      return {
        success: false,
        error: 'merchantTransactionId is required for PhonePe status verification'
      };
    }

    const statusResponse = await this.checkPaymentStatus(merchantTransactionId);

    const code = statusResponse?.code;
    const data = statusResponse?.data || {};
    const state = (data.state || (code === 'PAYMENT_SUCCESS' ? 'COMPLETED' : (code === 'PAYMENT_PENDING' ? 'PENDING' : 'FAILED'))).toUpperCase();
    const responseCode = data.responseCode;

    // Check for Successful payment
    const isSuccess = statusResponse.success === true &&
      (code === 'PAYMENT_SUCCESS' || state === 'COMPLETED' || responseCode === 'SUCCESS');

    if (isSuccess) {
      return {
        success: true,
        status: 'paid',
        state: 'COMPLETED',
        transaction_id: merchantTransactionId,
        phonepe_order_id: data.transactionId,
        amount: data.amount ? data.amount / 100 : undefined,
        raw: statusResponse
      };
    }

    // Check for Pending payment
    const isPending = code === 'PAYMENT_PENDING' ||
      state === 'PENDING' ||
      code === 'INTERNAL_SERVER_ERROR' ||
      code === 'TRANSACTION_NOT_FOUND';

    if (isPending) {
      return {
        success: false,
        status: 'pending',
        state: 'PENDING',
        transaction_id: merchantTransactionId,
        phonepe_order_id: data.transactionId,
        message: statusResponse.message || 'Payment is pending confirmation from PhonePe',
        raw: statusResponse
      };
    }

    // Otherwise treat as Failed
    return {
      success: false,
      status: 'failed',
      state: state || 'FAILED',
      transaction_id: merchantTransactionId,
      phonepe_order_id: data.transactionId,
      error: statusResponse.message || code || 'Payment failed on PhonePe',
      raw: statusResponse
    };
  }

  /**
   * 3. Callback and Webhook Handling
   * Handles server-to-server callback POST notifications from PhonePe V1
   */
  async handleWebhook({ headers = {}, body = {}, rawBody = '' }) {
    // Extract raw Base64 response
    let rawResponse = '';
    if (body && typeof body === 'object' && body.response) {
      rawResponse = body.response;
    } else if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        rawResponse = parsed.response || body;
      } catch {
        rawResponse = body;
      }
    } else if (typeof rawBody === 'string' && rawBody.length > 0) {
      try {
        const parsed = JSON.parse(rawBody);
        rawResponse = parsed.response || rawBody;
      } catch {
        rawResponse = rawBody;
      }
    }

    // Extract X-VERIFY signature
    const receivedChecksum = headers['x-verify'] || headers['X-VERIFY'] || headers['x-verify-signature'] || '';

    // Validate callback authenticity
    const isAuthentic = verifyCallbackChecksum(rawResponse, receivedChecksum, this.saltKey, this.saltIndex);
    if (!isAuthentic && receivedChecksum) {
      console.warn('[PhonePe Webhook] Callback X-VERIFY checksum signature mismatch or missing');
    }

    // Decode Base64 payload
    const decodedPayload = decodeBase64Payload(rawResponse) || (typeof body === 'object' ? body : {});
    const payloadData = decodedPayload.data || decodedPayload;

    const merchantTransactionId = payloadData.merchantTransactionId ||
      payloadData.merchantOrderId ||
      decodedPayload.merchantTransactionId;

    if (!merchantTransactionId) {
      return {
        success: false,
        statusCode: 400,
        message: 'Missing merchantTransactionId in PhonePe callback payload'
      };
    }

    // Handle Refund Callbacks
    if (merchantTransactionId.startsWith('REF_') || payloadData.merchantRefundId) {
      return await this._handleRefundWebhook(payloadData);
    }

    // ─── Case: Payment Callback ──────────────────────────────────────────────
    // Prompt rule: Never trust callback payload alone; verify independently via status API
    const verifiedStatus = await this.checkPaymentStatus(merchantTransactionId);
    const verifiedCode = verifiedStatus?.code;
    const verifiedData = verifiedStatus?.data || {};
    const state = (verifiedData.state || (verifiedCode === 'PAYMENT_SUCCESS' ? 'COMPLETED' : (verifiedCode === 'PAYMENT_PENDING' ? 'PENDING' : 'FAILED'))).toUpperCase();
    const amountInPaisa = verifiedData.amount || payloadData.amount;

    // Deduplication lock via Redis if available
    const lockKey = `webhook:phonepe:${merchantTransactionId}:${state}`;
    let hasLock = false;

    if (redisClient && redisClient.status === 'ready') {
      try {
        const setRes = await redisClient.set(lockKey, '1', 'EX', 120, 'NX');
        if (!setRes) {
          return {
            success: true,
            message: 'Duplicate callback event received; already processed (idempotent)',
            idempotent: true,
            state
          };
        }
        hasLock = true;
      } catch (redisErr) {
        // Fall back gracefully to database idempotency checks
      }
    }

    // Match transaction to order
    let orderId = null;
    let existingTx = null;

    try {
      const txRows = await db.query(
        'SELECT * FROM payment_transactions WHERE transaction_id = ? AND gateway = ? LIMIT 1',
        [merchantTransactionId, PhonePeGateway.keyName]
      );
      if (txRows.length > 0) {
        existingTx = txRows[0];
        orderId = existingTx.order_id;
      }
    } catch (e) {
      console.warn('[PhonePe Webhook] Error querying transaction:', e.message);
    }

    // Fallback order ID extraction from MT_<id>_<timestamp>
    if (!orderId && merchantTransactionId.startsWith('MT_')) {
      const parts = merchantTransactionId.split('_');
      if (parts.length >= 2 && !isNaN(parts[1])) {
        orderId = parseInt(parts[1], 10);
      }
    }

    if (!orderId) {
      return {
        success: false,
        statusCode: 404,
        message: `Could not associate callback merchantTransactionId '${merchantTransactionId}' with any order`
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

    // Validate payable amount matches
    const expectedPaisa = Math.round(parseFloat(order.grand_total) * 100);
    if (amountInPaisa && Math.abs(amountInPaisa - expectedPaisa) > 1) {
      console.error(`[PhonePe Webhook] Amount mismatch: received ${amountInPaisa} paisa, expected ${expectedPaisa} paisa`);
      return {
        success: false,
        statusCode: 400,
        message: `Amount mismatch: expected ₹${order.grand_total}, got ₹${amountInPaisa / 100}`
      };
    }

    // Idempotency: prevent duplicate order fulfillment
    if (order.payment_status === 'paid' && state === 'COMPLETED') {
      return {
        success: true,
        message: 'Order already fulfilled and marked paid (idempotent)',
        order_id: order.id,
        state
      };
    }

    // Process State
    if (state === 'COMPLETED' || verifiedCode === 'PAYMENT_SUCCESS') {
      if (existingTx) {
        await db.query(
          'UPDATE payment_transactions SET status = ?, response_payload = ?, updated_at = NOW() WHERE id = ?',
          ['success', JSON.stringify(verifiedStatus), existingTx.id]
        );
      } else {
        await db.query(
          `INSERT INTO payment_transactions (order_id, gateway, transaction_id, status, amount, response_payload)
           VALUES (?, ?, ?, 'success', ?, ?)`,
          [order.id, PhonePeGateway.keyName, merchantTransactionId, order.grand_total, JSON.stringify(verifiedStatus)]
        );
      }

      // Mark order paid
      await db.query(
        "UPDATE orders SET payment_status = 'paid', payment_gateway = ?, payment_ref = ?, paid_at = NOW() WHERE id = ?",
        [PhonePeGateway.keyName, merchantTransactionId, order.id]
      );

      // Trigger event bus
      eventBus.emit('payment.success', {
        orderId: order.id,
        gateway: PhonePeGateway.keyName,
        transactionId: merchantTransactionId,
        amount: order.grand_total
      });

      return {
        success: true,
        message: 'Payment callback processed; order marked paid',
        order_id: order.id,
        state: 'COMPLETED'
      };
    }

    if (state === 'FAILED' || verifiedCode === 'PAYMENT_ERROR' || verifiedCode === 'PAYMENT_DECLINED') {
      if (existingTx) {
        await db.query(
          'UPDATE payment_transactions SET status = ?, response_payload = ?, updated_at = NOW() WHERE id = ?',
          ['failed', JSON.stringify(verifiedStatus), existingTx.id]
        );
      } else {
        await db.query(
          `INSERT INTO payment_transactions (order_id, gateway, transaction_id, status, amount, response_payload)
           VALUES (?, ?, ?, 'failed', ?, ?)`,
          [order.id, PhonePeGateway.keyName, merchantTransactionId, order.grand_total, JSON.stringify(verifiedStatus)]
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

  /**
   * Handle Refund Webhook Event
   */
  async _handleRefundWebhook(payload) {
    const merchantRefundId = payload.merchantTransactionId || payload.merchantRefundId;
    const state = (payload.state || 'PENDING').toUpperCase();

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
   * 4. Refund Implementation
   * Endpoint: POST /pg/v1/refund
   */
  async refund({ transactionId, amount, reason }) {
    if (!transactionId) {
      throw new Error('transactionId is required to initiate a refund');
    }
    const refundAmount = Number(amount);
    if (!refundAmount || refundAmount <= 0) {
      throw new Error('Valid refund amount is required');
    }

    this._assertProductionSafety();

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

    // Validate refundable balance
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

    const refundPayload = {
      merchantId: this.merchantId,
      merchantUserId: `UID_${order.user_id || order.id}`,
      merchantTransactionId: merchantRefundId,
      originalTransactionId: originalMerchantOrderId,
      amount: amountInPaisa,
      callbackUrl: this.callbackUrl || `${this.frontendUrl}/api/v1/payments/webhook/phonepe`
    };

    const base64Payload = generateBase64Payload(refundPayload);
    const checksum = generateRefundChecksum(base64Payload, this.saltKey, this.saltIndex);

    let refundResponse;
    try {
      const res = await fetch(`${this.getBaseUrl()}/pg/v1/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'accept': 'application/json'
        },
        body: JSON.stringify({ request: base64Payload })
      });
      refundResponse = await res.json();
    } catch (networkErr) {
      throw new Error(`PhonePe refund request failed: ${networkErr.message}`);
    }

    const code = refundResponse?.code;
    const data = refundResponse?.data || {};
    const refundState = (data.state || (refundResponse.success ? 'COMPLETED' : 'FAILED')).toUpperCase();

    const isCompleted = refundResponse.success && (refundState === 'COMPLETED' || code === 'PAYMENT_SUCCESS');
    const isPending = refundState === 'PENDING' || code === 'PAYMENT_PENDING';

    const initialTxStatus = isCompleted ? 'refunded' : (isPending ? 'pending' : 'failed');

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

    if (isCompleted) {
      await db.query(
        "UPDATE orders SET payment_status = 'refunded', status = 'refunded' WHERE id = ?",
        [order.id]
      );
    }

    if (!refundResponse.success && !isPending) {
      return {
        success: false,
        state: refundState,
        refund_id: merchantRefundId,
        merchant_refund_id: merchantRefundId,
        original_order_id: originalMerchantOrderId,
        amount: refundAmount,
        error: refundResponse.message || code || 'Refund failed on PhonePe',
        raw: refundResponse
      };
    }

    return {
      success: isCompleted || isPending,
      state: refundState,
      refund_id: data.transactionId || merchantRefundId,
      merchant_refund_id: merchantRefundId,
      original_order_id: originalMerchantOrderId,
      amount: refundAmount,
      raw: refundResponse
    };
  }

  /**
   * 5. Refund Status Verification
   * Endpoint: GET /pg/v1/status/{merchantId}/{merchantRefundId}
   */
  async getRefundStatus({ refundId, merchantRefundId }) {
    const idToQuery = merchantRefundId || refundId;
    if (!idToQuery) {
      throw new Error('merchantRefundId or refundId is required to check refund status');
    }

    const checksum = generateStatusChecksum(
      this.merchantId,
      idToQuery,
      this.saltKey,
      this.saltIndex
    );

    const url = `${this.getBaseUrl()}/pg/v1/status/${this.merchantId}/${idToQuery}`;

    let refundStatusResponse;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'X-MERCHANT-ID': this.merchantId,
          'accept': 'application/json'
        }
      });
      refundStatusResponse = await res.json();
    } catch (networkErr) {
      throw new Error(`PhonePe refund status request failed: ${networkErr.message}`);
    }

    const code = refundStatusResponse?.code;
    const data = refundStatusResponse?.data || {};
    const state = (data.state || (refundStatusResponse.success ? 'COMPLETED' : 'FAILED')).toUpperCase();
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
      refund_id: data.transactionId || idToQuery,
      merchant_refund_id: idToQuery,
      amount: data.amount ? data.amount / 100 : undefined,
      raw: refundStatusResponse
    };
  }
}

module.exports = PhonePeGateway;
