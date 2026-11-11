const redisClient = require('../config/redis');
const LRUCache = require('./lruCache');

const VERSION_KEY = 'shipping:ver';
const DEFAULT_TTL_SEC = 300;
const LOCAL_LRU_TTL_MS = 60000;

const localCache = new LRUCache(100, LOCAL_LRU_TTL_MS);
let localVersion = 1;

function isRedisReady() {
  return Boolean(redisClient && redisClient.status === 'ready');
}

async function getShippingVersion() {
  if (isRedisReady()) {
    try {
      const ver = await redisClient.get(VERSION_KEY);
      if (ver !== null) {
        const parsed = parseInt(ver, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          localVersion = parsed;
          return parsed;
        }
      }
      await redisClient.set(VERSION_KEY, String(localVersion), 'NX');
    } catch (_) {
      // Fall back to in-process version
    }
  }
  return localVersion;
}

/**
 * O(1) cache invalidation via monotonic generation counter.
 */
async function bumpShippingVersion() {
  localVersion += 1;
  localCache.clear();
  if (isRedisReady()) {
    try {
      const nextVer = await redisClient.incr(VERSION_KEY);
      if (Number.isFinite(nextVer)) {
        localVersion = nextVer;
      }
    } catch (_) {
      // L1 already invalidated
    }
  }
  return localVersion;
}

/**
 * Two-tier (L1 LRU + L2 Redis) cache-aside with single-flight coalescing.
 * Note: serialized values (like JSON-safe objects/arrays) are stored in Redis;
 * optional transformFn builds an in-memory structure (e.g. Map) on L1 hydration.
 */
async function getOrSetShippingCache(subKey, fetchFn, ttlSec = DEFAULT_TTL_SEC) {
  const version = await getShippingVersion();
  const fullKey = `shipping:v${version}:${subKey}`;

  const l1Hit = localCache.get(fullKey);
  if (l1Hit !== undefined) {
    return l1Hit;
  }

  return localCache.singleFlight(fullKey, async () => {
    const l1Retry = localCache.get(fullKey);
    if (l1Retry !== undefined) return l1Retry;

    if (isRedisReady()) {
      try {
        const cached = await redisClient.get(fullKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          localCache.set(fullKey, parsed, Math.min(ttlSec * 1000, LOCAL_LRU_TTL_MS));
          return parsed;
        }
      } catch (_) {
        // Proceed to DB on Redis error
      }
    }

    const freshData = await fetchFn();
    if (freshData !== undefined && freshData !== null) {
      localCache.set(fullKey, freshData, Math.min(ttlSec * 1000, LOCAL_LRU_TTL_MS));
      if (isRedisReady()) {
        try {
          await redisClient.set(fullKey, JSON.stringify(freshData), 'EX', ttlSec);
        } catch (_) {
          // Non-fatal
        }
      }
    }

    return freshData;
  });
}

module.exports = {
  getShippingVersion,
  bumpShippingVersion,
  getOrSetShippingCache
};
