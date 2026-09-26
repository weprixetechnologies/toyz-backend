const express = require('express');
const router = express.Router();
const settingsController = require('./settingsController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const activityLogger = require('../../middleware/activityLogger');

// Public settings
router.get('/settings', settingsController.getPublicSettings);

// Admin settings
router.get('/admin/settings', authMiddleware, roleGuard('admin', 'superadmin'), settingsController.getAllSettings);
router.put('/admin/settings', authMiddleware, roleGuard('superadmin'), activityLogger('settings', 'bulk_update_settings'), settingsController.bulkUpdateSettings);
router.put('/admin/settings/:key', authMiddleware, roleGuard('superadmin'), activityLogger('settings', 'update_single_setting'), settingsController.updateSingleSetting);
router.post('/admin/cache/flush', authMiddleware, roleGuard('superadmin'), activityLogger('settings', 'flush_cache'), settingsController.flushCache);

module.exports = router;
