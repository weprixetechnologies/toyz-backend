const redisClient = require('../config/redis');

async function getOrSet(key, ttl, fetchFn) {
  try {
    if (redisClient && redisClient.status === 'ready') {
      const cached = await redisClient.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const data = await fetchFn();

    if (data !== undefined && data !== null && redisClient && redisClient.status === 'ready') {
      await redisClient.set(key, JSON.stringify(data), 'EX', ttl);
    }

    return data;
  } catch (err) {
    console.warn(`[CacheAside Warning for key '${key}']:`, err.message);
    return fetchFn();
  }
}

async function purgePattern(pattern) {
  try {
    if (redisClient && redisClient.status === 'ready') {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
        console.log(`[CacheAside Purged] Pattern '${pattern}': deleted ${keys.length} key(s)`);
      }
    }
  } catch (err) {
    console.warn(`[CacheAside Purge Error for pattern '${pattern}']:`, err.message);
  }
}

module.exports = {
  getOrSet,
  purgePattern
};
