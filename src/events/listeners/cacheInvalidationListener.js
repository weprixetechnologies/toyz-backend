const eventBus = require('../bus');
const { purgePattern } = require('../../cache/cacheAside');
const { PREFIXES } = require('../../cache/keys');

function registerCacheInvalidationListeners() {
  eventBus.on('product.changed', async (data) => {
    console.log("[CacheInvalidation] Handling 'product.changed'");
    await purgePattern(PREFIXES.products);
  });

  eventBus.on('category.changed', async (data) => {
    console.log("[CacheInvalidation] Handling 'category.changed'");
    await purgePattern(PREFIXES.categories);
  });

  eventBus.on('offer.changed', async (data) => {
    console.log("[CacheInvalidation] Handling 'offer.changed'");
    await purgePattern(PREFIXES.offers);
  });

  eventBus.on('settings.changed', async (data) => {
    console.log("[CacheInvalidation] Handling 'settings.changed'");
    await purgePattern(PREFIXES.settings);
  });
}

module.exports = registerCacheInvalidationListeners;
