/**
 * Comprehensive PhonePe V1 Integration Test Suite
 * Covers deterministic unit tests, adapter contract validation,
 * and live PhonePe sandbox endpoints.
 */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PaymentGateway = require('../src/modules/payments/gateways/base');
const RazorpayGateway = require('../src/modules/payments/gateways/razorpay');
const PhonePeGateway = require('../src/modules/payments/gateways/phonepe');
const { getGateway, getRegisteredGateways } = require('../src/modules/payments/gateways');
const {
  generateBase64Payload,
  decodeBase64Payload,
  generateChecksum,
  generatePaymentChecksum,
  generateStatusChecksum,
  generateRefundChecksum,
  verifyCallbackChecksum,
  validateMobileNumber
} = require('../src/modules/payments/gateways/phonepeUtils');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

async function runAllTests() {
  console.log('================================================================');
  console.log(' PHONEPE V1 LEGACY PAYMENT GATEWAY - COMPREHENSIVE TEST SUITE');
  console.log('================================================================\n');

  // ───────────────────────────────────────────────────────────────────────────
  console.log('--- 1. SDK-FREE V1 GATEWAY INITIALIZATION ---');
  // ───────────────────────────────────────────────────────────────────────────
  test('Gateway class initializes without @phonepe-pg/pg-sdk-node', () => {
    const gw = new PhonePeGateway({
      merchantId: 'PGTESTPAYUAT',
      saltKey: '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399',
      saltIndex: '1',
      env: 'SANDBOX'
    });
    assert.strictEqual(PhonePeGateway.keyName, 'phonepe');
    assert.strictEqual(PhonePeGateway.displayName, 'PhonePe Payment Gateway');
    assert.strictEqual(gw.merchantId, 'PGTESTPAYUAT');
    assert.strictEqual(gw.saltKey, '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399');
    assert.strictEqual(gw.saltIndex, '1');
    assert.strictEqual(gw.env, 'SANDBOX');
    assert.strictEqual(gw.getBaseUrl(), 'https://api-preprod.phonepe.com/apis/pg-sandbox');
    assert(!gw._client, 'Should not have any V2 client object');
  });

  test('Production environment resolves to hermes base URL & enforces safety guard', () => {
    const prodGw = new PhonePeGateway({
      merchantId: 'PROD_MERCHANT',
      saltKey: 'prod-salt-key-real',
      saltIndex: '2',
      env: 'PRODUCTION'
    });
    assert.strictEqual(prodGw.getBaseUrl(), 'https://api.phonepe.com/apis/hermes');

    // Production safety check blocks test credentials
    const unsafeGw = new PhonePeGateway({
      merchantId: 'PGTESTPAYUAT',
      saltKey: '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399',
      saltIndex: '1',
      env: 'PRODUCTION'
    });
    assert.throws(() => {
      unsafeGw._assertProductionSafety();
    }, /Sandbox UAT credentials cannot be used in PRODUCTION/);
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. BASE64 ENCODING & PAYLOAD HANDLING ---');
  // ───────────────────────────────────────────────────────────────────────────
  test('generateBase64Payload & decodeBase64Payload bidirectional fidelity', () => {
    const testData = {
      merchantId: 'PGTESTPAYUAT',
      amount: 15000,
      redirectUrl: 'http://localhost:3000/checkout/verify',
      paymentInstrument: { type: 'PAY_PAGE' }
    };
    const b64 = generateBase64Payload(testData);
    assert(typeof b64 === 'string' && b64.length > 0);

    const decoded = decodeBase64Payload(b64);
    assert.deepStrictEqual(decoded, testData);
  });

  test('Mobile number validation handles 10-digit, +91 prefixes and non-digit formats', () => {
    assert.strictEqual(validateMobileNumber('9876543210'), '9876543210');
    assert.strictEqual(validateMobileNumber('+91 9876543210'), '9876543210');
    assert.strictEqual(validateMobileNumber('91-9876543210'), '9876543210');
    assert.strictEqual(validateMobileNumber('09876543210'), null); // leading 0 (11 digits)
    assert.strictEqual(validateMobileNumber('12345'), null); // too short
    assert.strictEqual(validateMobileNumber(''), null);
    assert.strictEqual(validateMobileNumber(null), null);
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. DETERMINISTIC SHA-256 CHECKSUM GENERATION ---');
  // ───────────────────────────────────────────────────────────────────────────
  test('Deterministic Payment checksum calculation matches formula', () => {
    const saltKey = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
    const saltIndex = '1';
    const json = '{"merchantId":"PGTESTPAYUAT","amount":10000}';
    const b64 = Buffer.from(json).toString('base64');
    
    // Calculated independently:
    // SHA256(b64 + "/pg/v1/pay" + saltKey) + "###1"
    const expectedHash = 'd70dac2fd539fc617d0563178dfd047e32e74361971979cdb5dac3ee9b197723###1';
    const actualChecksum = generatePaymentChecksum(b64, saltKey, saltIndex);
    assert.strictEqual(actualChecksum, expectedHash);
  });

  test('Deterministic Status checksum calculation matches formula', () => {
    const saltKey = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
    const saltIndex = '1';
    const merchantId = 'PGTESTPAYUAT';
    const merchantTransactionId = 'MT_12345_6789';

    // Formula: SHA256("/pg/v1/status/" + merchantId + "/" + merchantTransactionId + saltKey) + "###" + saltIndex
    const expectedHash = '84a2b4ed01af0bc97c5219ae8d6808016f2acb32ef783e19260d5fdbde240651###1';
    const actualChecksum = generateStatusChecksum(merchantId, merchantTransactionId, saltKey, saltIndex);
    assert.strictEqual(actualChecksum, expectedHash);
  });

  test('Deterministic Refund checksum calculation matches formula', () => {
    const saltKey = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
    const saltIndex = '1';
    const json = '{"merchantId":"PGTESTPAYUAT","merchantTransactionId":"REF_123","originalTransactionId":"MT_123","amount":10000}';
    const b64 = Buffer.from(json).toString('base64');

    // Formula: SHA256(b64 + "/pg/v1/refund" + saltKey) + "###" + saltIndex
    const expectedHash = 'd551baa9c20956514d8512101dd496c3acf8b28cab3db9075e6ea273fd21d321###1';
    const actualChecksum = generateRefundChecksum(b64, saltKey, saltIndex);
    assert.strictEqual(actualChecksum, expectedHash);
  });

  test('verifyCallbackChecksum securely verifies authentic callbacks and rejects invalid signatures', () => {
    const saltKey = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
    const rawResponse = Buffer.from(JSON.stringify({ success: true, code: 'PAYMENT_SUCCESS' })).toString('base64');
    const validSignature = crypto.createHash('sha256').update(rawResponse + saltKey).digest('hex') + '###1';

    assert.strictEqual(verifyCallbackChecksum(rawResponse, validSignature, saltKey, '1'), true);
    assert.strictEqual(verifyCallbackChecksum(rawResponse, 'invalid_sig###1', saltKey, '1'), false);
    assert.strictEqual(verifyCallbackChecksum(rawResponse, validSignature, 'wrong_salt', '1'), false);
    assert.strictEqual(verifyCallbackChecksum('', validSignature, saltKey, '1'), false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. PAYMENT INITIATION & NORMALIZED RESPONSE ---');
  // ───────────────────────────────────────────────────────────────────────────
  await asyncTest('Payment initiation constructs normalized response with checkout_url and redirect_url', async () => {
    const gw = new PhonePeGateway({
      merchantId: 'TEST_MID',
      saltKey: 'test_salt_key',
      saltIndex: '1'
    });

    // Mock network fetch for this unit test
    const originalFetch = global.fetch;
    global.fetch = async (url, opts) => {
      assert(url.endsWith('/pg/v1/pay'), 'URL must end with /pg/v1/pay');
      assert.strictEqual(opts.method, 'POST');
      assert(opts.headers['X-VERIFY'].includes('###1'));
      const parsedBody = JSON.parse(opts.body);
      assert(parsedBody.request, 'Body must contain base64 request');

      return {
        json: async () => ({
          success: true,
          code: 'PAYMENT_INITIATED',
          message: 'Payment initiated',
          data: {
            merchantId: 'TEST_MID',
            merchantTransactionId: 'MT_123',
            instrumentResponse: {
              type: 'PAY_PAGE',
              redirectInfo: {
                url: 'https://mercury-uat.phonepe.com/transact/simulator?token=TEST_TOKEN',
                method: 'GET'
              }
            }
          }
        })
      };
    };

    try {
      const order = { id: 999, order_number: 'ORD-999', grand_total: '299.00' };
      const user = { id: 45, name: 'John Doe', email: 'john@example.com', phone: '9876543210' };

      const res = await gw.initiate({
        order,
        user,
        amount: 299.00,
        currency: 'INR'
      });

      assert.strictEqual(res.gateway, 'phonepe');
      assert(res.order_id.startsWith('MT_999_'));
      assert.strictEqual(res.amount, 29900); // 299 * 100 paise
      assert.strictEqual(res.redirect_url, 'https://mercury-uat.phonepe.com/transact/simulator?token=TEST_TOKEN');
      assert.strictEqual(res.checkout_url, 'https://mercury-uat.phonepe.com/transact/simulator?token=TEST_TOKEN');
      assert.strictEqual(res.state, 'PAYMENT_INITIATED');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 5. PAYMENT STATUS VERIFICATION (SUCCESS, PENDING, FAILED) ---');
  // ───────────────────────────────────────────────────────────────────────────
  await asyncTest('Status verification maps COMPLETED / PAYMENT_SUCCESS to paid', async () => {
    const gw = new PhonePeGateway({ merchantId: 'TEST_MID', saltKey: 'test_salt' });
    const originalFetch = global.fetch;

    global.fetch = async () => ({
      json: async () => ({
        success: true,
        code: 'PAYMENT_SUCCESS',
        message: 'Payment completed',
        data: {
          merchantId: 'TEST_MID',
          merchantTransactionId: 'MT_999_123',
          transactionId: 'T26110000001',
          amount: 29900,
          state: 'COMPLETED',
          responseCode: 'SUCCESS'
        }
      })
    });

    try {
      const result = await gw.verify({
        payload: { merchant_order_id: 'MT_999_123' },
        order: { id: 999 }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.status, 'paid');
      assert.strictEqual(result.state, 'COMPLETED');
      assert.strictEqual(result.transaction_id, 'MT_999_123');
      assert.strictEqual(result.amount, 299);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await asyncTest('Status verification maps PAYMENT_PENDING to pending', async () => {
    const gw = new PhonePeGateway({ merchantId: 'TEST_MID', saltKey: 'test_salt' });
    const originalFetch = global.fetch;

    global.fetch = async () => ({
      json: async () => ({
        success: true,
        code: 'PAYMENT_PENDING',
        message: 'Your payment is in pending state.',
        data: {
          merchantId: 'TEST_MID',
          merchantTransactionId: 'MT_999_123',
          transactionId: 'T26110000002',
          amount: 29900,
          state: 'PENDING'
        }
      })
    });

    try {
      const result = await gw.verify({
        payload: { merchant_order_id: 'MT_999_123' },
        order: { id: 999 }
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'pending');
      assert.strictEqual(result.state, 'PENDING');
      assert.strictEqual(result.transaction_id, 'MT_999_123');
    } finally {
      global.fetch = originalFetch;
    }
  });

  await asyncTest('Status verification maps PAYMENT_ERROR / declined to failed', async () => {
    const gw = new PhonePeGateway({ merchantId: 'TEST_MID', saltKey: 'test_salt' });
    const originalFetch = global.fetch;

    global.fetch = async () => ({
      json: async () => ({
        success: false,
        code: 'PAYMENT_ERROR',
        message: 'User cancelled transaction',
        data: {
          merchantId: 'TEST_MID',
          merchantTransactionId: 'MT_999_123',
          state: 'FAILED'
        }
      })
    });

    try {
      const result = await gw.verify({
        payload: { merchant_order_id: 'MT_999_123' },
        order: { id: 999 }
      });

      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 'failed');
      assert.strictEqual(result.state, 'FAILED');
      assert(result.error.includes('User cancelled'));
    } finally {
      global.fetch = originalFetch;
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 6. CALLBACK & WEBHOOK HANDLING ---');
  // ───────────────────────────────────────────────────────────────────────────
  await asyncTest('handleWebhook rejects callback without merchantTransactionId', async () => {
    const gw = new PhonePeGateway({ merchantId: 'TEST_MID', saltKey: 'test_salt' });
    const res = await gw.handleWebhook({
      headers: {},
      body: { response: Buffer.from(JSON.stringify({ data: {} })).toString('base64') }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.statusCode, 400);
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 7. REFUND & REFUND STATUS ---');
  // ───────────────────────────────────────────────────────────────────────────
  test('Refund validates required fields and negative amounts', async () => {
    const gw = new PhonePeGateway({ merchantId: 'TEST_MID', saltKey: 'test_salt' });
    await assert.rejects(async () => {
      await gw.refund({ transactionId: null, amount: 100 });
    }, /transactionId is required/);

    await assert.rejects(async () => {
      await gw.refund({ transactionId: 'MT_123', amount: -10 });
    }, /Valid refund amount is required/);
  });

  await asyncTest('getRefundStatus constructs V1 checksum and requests status', async () => {
    const gw = new PhonePeGateway({ merchantId: 'TEST_MID', saltKey: 'test_salt', saltIndex: '1' });
    const originalFetch = global.fetch;

    global.fetch = async (url, opts) => {
      assert(url.includes('/pg/v1/status/TEST_MID/REF_999_123'));
      assert.strictEqual(opts.headers['X-MERCHANT-ID'], 'TEST_MID');
      assert(opts.headers['X-VERIFY'].includes('###1'));

      return {
        json: async () => ({
          success: true,
          code: 'PAYMENT_SUCCESS',
          message: 'Refund successful',
          data: {
            merchantId: 'TEST_MID',
            merchantTransactionId: 'REF_999_123',
            transactionId: 'TX_REF_001',
            amount: 5000,
            state: 'COMPLETED'
          }
        })
      };
    };

    try {
      const res = await gw.getRefundStatus({ merchantRefundId: 'REF_999_123' });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.state, 'COMPLETED');
      assert.strictEqual(res.refund_id, 'TX_REF_001');
      assert.strictEqual(res.amount, 50); // 5000 paise -> 50 rupees
    } finally {
      global.fetch = originalFetch;
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 8. EXISTING GATEWAY COMPATIBILITY ---');
  // ───────────────────────────────────────────────────────────────────────────
  test('Razorpay and PhonePe registered concurrently without conflict', () => {
    const gateways = getRegisteredGateways();
    assert.strictEqual(gateways.length, 2);
    assert(gateways.some(g => g.key_name === 'razorpay'));
    assert(gateways.some(g => g.key_name === 'phonepe'));

    const rzp = getGateway('razorpay');
    const phn = getGateway('phonepe');
    assert(rzp instanceof RazorpayGateway);
    assert(phn instanceof PhonePeGateway);
    assert(rzp instanceof PaymentGateway);
    assert(phn instanceof PaymentGateway);
  });

  test('RazorpayGateway initiation and verify contracts remain identical', async () => {
    const rzp = getGateway('razorpay');
    const initRes = await rzp.initiate({
      order: { id: 101 },
      user: { name: 'Alice', email: 'alice@example.com', phone: '9999999999' },
      amount: 199.00
    });
    assert.strictEqual(initRes.gateway, 'razorpay');
    assert.strictEqual(initRes.amount, 19900);

    const verifyRes = await rzp.verify({
      payload: {
        razorpay_order_id: initRes.order_id,
        razorpay_payment_id: 'pay_test_123',
        razorpay_signature: 'simulated_sig'
      }
    });
    assert.strictEqual(verifyRes.success, true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 9. LIVE PHONEPE SANDBOX TESTS ---');
  // ───────────────────────────────────────────────────────────────────────────
  await asyncTest('Live Sandbox: Documented UAT credentials (PGTESTPAYUAT) test', async () => {
    const gw = new PhonePeGateway({
      merchantId: 'PGTESTPAYUAT',
      saltKey: '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399',
      saltIndex: '1'
    });

    const statusRes = await gw.checkPaymentStatus('MT_NONEXISTENT_999');
    console.log('    [PGTESTPAYUAT Status Response]:', statusRes.code, statusRes.message);
    // Verified: Returns KEY_NOT_CONFIGURED because PhonePe decommissioned that salt key
    assert.strictEqual(statusRes.code, 'KEY_NOT_CONFIGURED');
  });

  await asyncTest('Live Sandbox: Active UAT credentials (PGTESTPAYUAT86) Initiation & Status', async () => {
    const activeGw = new PhonePeGateway({
      merchantId: 'PGTESTPAYUAT86',
      saltKey: '96434309-7796-489d-8924-ab56988a6076',
      saltIndex: '1'
    });

    const dummyTxId = `MT_TEST_${Date.now()}`;
    const payload = {
      merchantId: activeGw.merchantId,
      merchantTransactionId: dummyTxId,
      merchantUserId: 'UID_TEST_101',
      amount: 10000,
      redirectUrl: 'http://localhost:3000/checkout/verify',
      redirectMode: 'REDIRECT',
      callbackUrl: 'https://backend.provokeplaytech.com/api/v1/payments/webhook/phonepe',
      paymentInstrument: { type: 'PAY_PAGE' }
    };

    const b64 = generateBase64Payload(payload);
    const checksum = generatePaymentChecksum(b64, activeGw.saltKey, activeGw.saltIndex);

    const res = await fetch(`${activeGw.getBaseUrl()}/pg/v1/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'accept': 'application/json'
      },
      body: JSON.stringify({ request: b64 })
    });
    const data = await res.json();
    console.log('    [PGTESTPAYUAT86 Pay Response]:', data.code, data.message);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.code, 'PAYMENT_INITIATED');
    assert(data.data?.instrumentResponse?.redirectInfo?.url.includes('simulator'));

    // Check status of newly initiated transaction
    const statusData = await activeGw.checkPaymentStatus(dummyTxId);
    console.log('    [PGTESTPAYUAT86 Status Response]:', statusData.code, statusData.data?.state);
    assert.strictEqual(statusData.success, true);
    assert.strictEqual(statusData.code, 'PAYMENT_PENDING');
    assert.strictEqual(statusData.data?.state, 'PENDING');
  });

  console.log('\n================================================================');
  console.log(` RESULTS: ${passedTests} / ${totalTests} tests passed`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
