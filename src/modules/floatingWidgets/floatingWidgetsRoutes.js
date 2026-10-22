const express = require('express');
const router = express.Router();
const floatingWidgetsController = require('./floatingWidgetsController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

// Public route: lightweight config retrieval
router.get('/config', floatingWidgetsController.getPublicConfig);

// Admin routes: protected
router.get('/admin/config', authMiddleware, roleGuard('admin', 'superadmin'), floatingWidgetsController.getAdminConfig);
router.put('/admin/config', authMiddleware, roleGuard('admin', 'superadmin'), floatingWidgetsController.updateAdminConfig);

module.exports = router;
