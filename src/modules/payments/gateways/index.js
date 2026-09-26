const { query } = require('../../../config/db');
const RazorpayGateway = require('./razorpay');

const REGISTRY = [
  RazorpayGateway
];

const instances = {};
REGISTRY.forEach((GatewayClass) => {
  instances[GatewayClass.keyName] = new GatewayClass();
});

async function syncGatewaysToDb() {
  try {
    for (const GatewayClass of REGISTRY) {
      await query(
        `INSERT INTO payment_gateways (key_name, display_name, is_active)
         VALUES (?, ?, 0)
         ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);`,
        [GatewayClass.keyName, GatewayClass.displayName]
      );
    }
    console.log(`[Payment Gateway Registry] Synced ${REGISTRY.length} gateway(s) to DB.`);
  } catch (error) {
    console.error('[Payment Gateway Sync Error]:', error.message);
  }
}

function getGateway(keyName) {
  return instances[keyName] || null;
}

function getRegisteredGateways() {
  return REGISTRY.map((cls) => ({ key_name: cls.keyName, display_name: cls.displayName }));
}

module.exports = {
  syncGatewaysToDb,
  getGateway,
  getRegisteredGateways
};
