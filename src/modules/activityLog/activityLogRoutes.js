const express = require('express');
const router = express.Router();
const activityLogController = require('./activityLogController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

// Superadmin & Admin Activity Log Endpoints
router.get('/activity-log', authMiddleware, roleGuard('superadmin', 'admin'), activityLogController.listLogs);
router.get('/activity-log/export', authMiddleware, roleGuard('superadmin'), activityLogController.exportLogs);

module.exports = router;
