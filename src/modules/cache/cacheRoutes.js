const express = require('express');
const router = express.Router();
const cacheController = require('./cacheController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

// Require admin or superadmin to manage cache
router.use(authMiddleware);
router.use(roleGuard('admin', 'superadmin'));

router.get('/keys', cacheController.getCacheKeys);
router.get('/keys/:key', cacheController.getCacheValue);
router.delete('/flush', cacheController.flushAllCache);
router.delete('/keys/:key', cacheController.flushCacheKey);

module.exports = router;
