const express = require('express');
const router = express.Router();
const smsAdminController = require('./smsAdminController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

router.get('/admin/sms/balance', authMiddleware, roleGuard('admin', 'superadmin'), smsAdminController.getSmsBalance);
router.get('/admin/sms/log', authMiddleware, roleGuard('admin', 'superadmin'), smsAdminController.getSmsLogs);
router.post('/admin/sms/test', authMiddleware, roleGuard('superadmin'), smsAdminController.sendTestSms);
router.get('/admin/sms/templates', authMiddleware, roleGuard('admin', 'superadmin'), smsAdminController.listTemplates);
router.put('/admin/sms/templates/:id', authMiddleware, roleGuard('superadmin'), smsAdminController.updateTemplate);
router.get('/admin/sms/dlr/:jobId', authMiddleware, roleGuard('admin', 'superadmin'), smsAdminController.getDlrStatus);

module.exports = router;
