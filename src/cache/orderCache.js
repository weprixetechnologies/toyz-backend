const redisClient = require('../config/redis');
const LRUCache = require('./lruCache');

const VERSION_KEY = 'orders:ver';
const DEFAULT_TTL_SEC = 60;
const LOCAL_LRU_TTL_MS = 15000;

// In-process L1 LRU cache in front of Redis (L2)
const localCache = new LRUCache(300, LOCAL_LRU_TTL_MS);
let localVersion = 1;

function isRedisReady() {
  return Boolean(redisClient && redisClient.status === 'ready');
}

async function getOrdersVersion() {
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
 * Avoids O(K) Redis KEYS/SCAN sweeps across the keyspace.
 */
async function bumpOrdersVersion() {
  localVersion += 1;
  localCache.clear();
  if (isRedisReady()) {
    try {
      const nextVer = await redisClient.incr(VERSION_KEY);
      if (Number.isFinite(nextVer)) {
        localVersion = nextVer;
      }
    } catch (_) {
      // Local version bump still invalidates L1 immediately
    }
  }
  return localVersion;
}

/**
 * Two-tier (L1 LRU + L2 Redis) cache-aside with single-flight coalescing.
 */
async function getOrSetOrderCache(subKey, fetchFn, ttlSec = DEFAULT_TTL_SEC) {
  const version = await getOrdersVersion();
  const fullKey = `orders:v${version}:${subKey}`;

  // L1: O(1) in-memory LRU check
  const l1Hit = localCache.get(fullKey);
  if (l1Hit !== undefined) {
    return l1Hit;
  }

  return localCache.singleFlight(fullKey, async () => {
    // Re-check L1 inside single-flight
    const l1Retry = localCache.get(fullKey);
    if (l1Retry !== undefined) {
      return l1Retry;
    }

    // L2: Redis check
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
  getOrdersVersion,
  bumpOrdersVersion,
  getOrSetOrderCache
};
