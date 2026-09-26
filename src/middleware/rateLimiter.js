const redisClient = require('../config/redis');

function createRateLimiter(opts = {}) {
  const windowSec = opts.windowSec || 60; // 1 minute window
  const maxHits = opts.maxHits || 5;      // 5 requests per window
  const keyPrefix = opts.prefix || 'rl';

  return async (req, res, next) => {
    try {
      const identifier = req.body?.phone || req.body?.email || req.ip || 'anonymous';
      const key = `${keyPrefix}:${identifier}`;

      if (redisClient && redisClient.status === 'ready') {
        const hits = await redisClient.incr(key);
        if (hits === 1) {
          await redisClient.expire(key, windowSec);
        }
        if (hits > maxHits) {
          return res.status(429).json({
            success: false,
            message: `Too many requests. Please wait ${windowSec} seconds before trying again.`
          });
        }
      }
      next();
    } catch (err) {
      console.warn('[RateLimiter Warning]:', err.message);
      next(); // Proceed if Redis rate limiting encounters error
    }
  };
}

module.exports = createRateLimiter;
