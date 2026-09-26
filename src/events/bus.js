const EventEmitter = require('events');
const redisClient = require('../config/redis');

class EventBus extends EventEmitter {}
const bus = new EventBus();

// Bridge with Redis Pub/Sub if redis is available
if (redisClient && redisClient.status === 'ready') {
  const subClient = redisClient.duplicate();
  subClient.subscribe('ecom_events', (err) => {
    if (err) console.warn('[Redis PubSub] Subscription error:', err.message);
  });

  subClient.on('message', (channel, message) => {
    try {
      const { event, payload } = JSON.parse(message);
      bus.emit(event, payload, true); // true indicates came from Redis
    } catch (e) {
      console.warn('[Redis PubSub] Message parse error:', e.message);
    }
  });

  const originalEmit = bus.emit.bind(bus);
  bus.emit = (event, payload, fromRedis = false) => {
    originalEmit(event, payload);
    if (!fromRedis && redisClient.status === 'ready') {
      redisClient.publish('ecom_events', JSON.stringify({ event, payload })).catch(() => {});
    }
  };
}

module.exports = bus;
