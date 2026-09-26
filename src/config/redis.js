const Redis = require('ioredis');
require('dotenv').config();

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

const redisClient = new Redis({
  host: redisHost,
  port: redisPort,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  lazyConnect: true
});

redisClient.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

redisClient.on('error', (err) => {
  console.warn('[Redis] Warning / Error:', err.message);
});

(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    console.warn('[Redis] Initial connection error:', err.message);
  }
})();

module.exports = redisClient;
