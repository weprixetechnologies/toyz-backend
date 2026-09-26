const registerSmsListeners = require('./smsListener');
const registerActivityLogListeners = require('./activityLogListener');
const registerCacheInvalidationListeners = require('./cacheInvalidationListener');
const registerLowStockListeners = require('./lowStockListener');
const registerAffiliateListeners = require('./affiliateListener');

function initEventListeners() {
  registerSmsListeners();
  registerActivityLogListeners();
  registerCacheInvalidationListeners();
  registerLowStockListeners();
  registerAffiliateListeners();
  console.log('[EventBus] All Phase 1, 2, 3 & 4 event listeners registered.');
}

module.exports = initEventListeners;
