require('dotenv').config();

module.exports = {
  apiKey: process.env.SMS_GATEWAY_API_KEY || 'dummy_sms_key',
  senderId: process.env.SMS_SENDER_ID || 'WEPRIX'
};
