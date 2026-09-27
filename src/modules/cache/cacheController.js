const redisClient = require('../../config/redis');

async function getCacheKeys(req, res, next) {
  try {
    const keys = await redisClient.keys('*');
    res.json({ success: true, data: keys });
  } catch (error) {
    next(error);
  }
}

async function flushCacheKey(req, res, next) {
  try {
    const { key } = req.params;
    const deleted = await redisClient.del(key);
    res.json({ success: true, message: `Key ${key} deleted`, deleted });
  } catch (error) {
    next(error);
  }
}

async function flushAllCache(req, res, next) {
  try {
    await redisClient.flushdb();
    res.json({ success: true, message: 'All cache flushed successfully' });
  } catch (error) {
    next(error);
  }
}

async function getCacheValue(req, res, next) {
  try {
    const { key } = req.params;
    const value = await redisClient.get(key);
    let parsed = value;
    try {
      if (value) parsed = JSON.parse(value);
    } catch(e) {}
    res.json({ success: true, data: parsed });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCacheKeys,
  flushCacheKey,
  flushAllCache,
  getCacheValue
};
