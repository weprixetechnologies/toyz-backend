const crypto = require('crypto');

/**
 * PhonePe V1 Cryptographic and Utility Helper Functions
 * Implements deterministic SHA-256 checksums and payload encodings
 * per the legacy PhonePe V1 Standard Checkout API specification.
 */

/**
 * Convert request payload into a Base64-encoded JSON string
 * @param {object|string} payload
 * @returns {string} Base64 encoded payload
 */
function generateBase64Payload(payload) {
  if (!payload) {
    throw new Error('Payload is required for Base64 encoding');
  }
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return Buffer.from(payloadString, 'utf8').toString('base64');
}

/**
 * Decode a Base64 string into its original utf8 string or parsed JSON
 * @param {string} base64String
 * @returns {any} Decoded object or raw string
 */
function decodeBase64Payload(base64String) {
  if (!base64String || typeof base64String !== 'string') {
    return null;
  }
  try {
    const jsonStr = Buffer.from(base64String, 'base64').toString('utf8');
    try {
      return JSON.parse(jsonStr);
    } catch {
      return jsonStr;
    }
  } catch {
    return null;
  }
}

/**
 * Generate generic SHA-256 checksum with Salt Index suffix
 * Formula: SHA256(stringToHash) + "###" + saltIndex
 * @param {string} stringToHash
 * @param {string} saltKey
 * @param {string|number} saltIndex
 * @returns {string} Checksum string (e.g. "<hex>###<index>")
 */
function generateChecksum(stringToHash, saltKey, saltIndex) {
  if (!stringToHash) {
    throw new Error('stringToHash is required to generate checksum');
  }
  if (!saltKey) {
    throw new Error('saltKey is required to generate checksum');
  }
  const index = saltIndex !== undefined && saltIndex !== null ? String(saltIndex) : '1';
  const sha256 = crypto.createHash('sha256').update(stringToHash).digest('hex');
  return `${sha256}###${index}`;
}

/**
 * Generate V1 Payment Initiation Checksum
 * Formula: SHA256(base64Payload + "/pg/v1/pay" + saltKey) + "###" + saltIndex
 * @param {string} base64Payload
 * @param {string} saltKey
 * @param {string|number} saltIndex
 * @returns {string}
 */
function generatePaymentChecksum(base64Payload, saltKey, saltIndex) {
  if (!base64Payload) {
    throw new Error('base64Payload is required for payment checksum');
  }
  const stringToHash = `${base64Payload}/pg/v1/pay${saltKey}`;
  return generateChecksum(stringToHash, saltKey, saltIndex);
}

/**
 * Generate V1 Order Status Checksum
 * Formula: SHA256("/pg/v1/status/" + merchantId + "/" + merchantTransactionId + saltKey) + "###" + saltIndex
 * @param {string} merchantId
 * @param {string} merchantTransactionId
 * @param {string} saltKey
 * @param {string|number} saltIndex
 * @returns {string}
 */
function generateStatusChecksum(merchantId, merchantTransactionId, saltKey, saltIndex) {
  if (!merchantId || !merchantTransactionId) {
    throw new Error('merchantId and merchantTransactionId are required for status checksum');
  }
  const stringToHash = `/pg/v1/status/${merchantId}/${merchantTransactionId}${saltKey}`;
  return generateChecksum(stringToHash, saltKey, saltIndex);
}

/**
 * Generate V1 Refund Checksum
 * Formula: SHA256(base64Payload + "/pg/v1/refund" + saltKey) + "###" + saltIndex
 * @param {string} base64Payload
 * @param {string} saltKey
 * @param {string|number} saltIndex
 * @returns {string}
 */
function generateRefundChecksum(base64Payload, saltKey, saltIndex) {
  if (!base64Payload) {
    throw new Error('base64Payload is required for refund checksum');
  }
  const stringToHash = `${base64Payload}/pg/v1/refund${saltKey}`;
  return generateChecksum(stringToHash, saltKey, saltIndex);
}

/**
 * Verify PhonePe V1 Callback X-VERIFY signature
 * Formula: SHA256(rawResponseBase64 + saltKey) + "###" + saltIndex
 * @param {string} rawResponseBase64
 * @param {string} receivedChecksum
 * @param {string} saltKey
 * @param {string|number} saltIndex
 * @returns {boolean} True if checksum matches securely
 */
function verifyCallbackChecksum(rawResponseBase64, receivedChecksum, saltKey, saltIndex) {
  if (!rawResponseBase64 || !receivedChecksum || !saltKey) {
    return false;
  }
  try {
    const parts = receivedChecksum.split('###');
    const incomingIndex = parts.length > 1 ? parts[1] : (saltIndex || '1');
    const stringToHash = `${rawResponseBase64}${saltKey}`;
    const expectedChecksum = generateChecksum(stringToHash, saltKey, incomingIndex);

    const expectedBuf = Buffer.from(expectedChecksum, 'utf8');
    const receivedBuf = Buffer.from(receivedChecksum, 'utf8');

    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

/**
 * Validate and sanitize Indian mobile number for PhonePe (10 digits starting with 6-9)
 * @param {string} phone
 * @returns {string|null} Valid 10-digit number or null
 */
function validateMobileNumber(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    const sub = digits.slice(2);
    if (/^[6-9]\d{9}$/.test(sub)) {
      return sub;
    }
  }
  return null;
}

module.exports = {
  generateBase64Payload,
  decodeBase64Payload,
  generateChecksum,
  generatePaymentChecksum,
  generateStatusChecksum,
  generateRefundChecksum,
  verifyCallbackChecksum,
  validateMobileNumber
};
