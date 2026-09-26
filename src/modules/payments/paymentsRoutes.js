const express = require('express');
const router = express.Router();
const paymentsController = require('./paymentsController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const activityLogger = require('../../middleware/activityLogger');

// Public Payment endpoints
router.get('/payments/methods', paymentsController.getPaymentMethods);
router.post('/payments/webhook/:gateway', paymentsController.handleWebhook);

// Auth Payment endpoints
router.post('/payments/initiate', authMiddleware, paymentsController.initiatePayment);
router.post('/payments/verify', authMiddleware, paymentsController.verifyPayment);

// Admin Payment Gateway Management (GET list and toggle PUTs ONLY)
router.get('/admin/payments/gateways', authMiddleware, roleGuard('admin', 'superadmin'), paymentsController.listAdminGateways);
router.put('/admin/payments/gateways/:key/toggle', authMiddleware, roleGuard('superadmin'), activityLogger('payments', 'toggle_gateway'), paymentsController.toggleGateway);
router.put('/admin/payments/cod/toggle', authMiddleware, roleGuard('superadmin'), activityLogger('payments', 'toggle_cod'), paymentsController.toggleCod);

module.exports = router;
