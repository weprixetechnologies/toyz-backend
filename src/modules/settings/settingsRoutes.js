const express = require('express');
const router = express.Router();
const settingsController = require('./settingsController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const activityLogger = require('../../middleware/activityLogger');

// Public settings
router.get('/settings', settingsController.getPublicSettings);
router.get('/header', settingsController.getHeaderSettings);
router.get('/footer', settingsController.getFooterSettings);

// Admin settings
router.get('/admin/header', authMiddleware, roleGuard('admin', 'superadmin'), settingsController.getHeaderSettings);
router.put('/admin/header', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('settings', 'update_header'), settingsController.updateHeaderSettings);
router.get('/admin/footer', authMiddleware, roleGuard('admin', 'superadmin'), settingsController.getFooterSettings);
router.put('/admin/footer', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('settings', 'update_footer'), settingsController.updateFooterSettings);
router.get('/admin/settings', authMiddleware, roleGuard('admin', 'superadmin'), settingsController.getAllSettings);
router.put('/admin/settings', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('settings', 'bulk_update_settings'), settingsController.bulkUpdateSettings);
router.put('/admin/settings/:key', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('settings', 'update_single_setting'), settingsController.updateSingleSetting);
router.post('/admin/cache/flush', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('settings', 'flush_cache'), settingsController.flushCache);

module.exports = router;
