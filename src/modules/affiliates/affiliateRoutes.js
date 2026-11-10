const express = require('express');
const router = express.Router();
const affiliateController = require('./affiliateController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const adminGuard = roleGuard('admin', 'superadmin');

// Public tracking endpoint
router.get('/track', affiliateController.track);

// Authenticated user (Affiliate) endpoints
router.post('/register', authMiddleware, affiliateController.register);
router.get('/dashboard', authMiddleware, affiliateController.dashboard);
router.get('/commissions', authMiddleware, affiliateController.commissions);
router.post('/payout/request', authMiddleware, affiliateController.requestPayout);
router.get('/payout/history', authMiddleware, affiliateController.payoutHistory);
router.get('/links', authMiddleware, affiliateController.links);

// Admin endpoints (Mounted at /api/v1/affiliate)
router.get('/admin/list', authMiddleware, adminGuard, affiliateController.adminList);
router.get('/admin/payouts', authMiddleware, adminGuard, affiliateController.adminListPayouts);
router.get('/admin/:id', authMiddleware, adminGuard, affiliateController.adminDetail);
router.put('/admin/:id/commission', authMiddleware, adminGuard, affiliateController.adminSetCommission);
router.put('/admin/:id/status', authMiddleware, adminGuard, affiliateController.adminUpdateStatus);
router.put('/admin/payouts/:id', authMiddleware, adminGuard, affiliateController.adminProcessPayout);

// Direct /admin/affiliates aliases (When mounted under /api/v1)
router.get('/admin/affiliates/payouts', authMiddleware, adminGuard, affiliateController.adminListPayouts);
router.put('/admin/affiliates/payouts/:id', authMiddleware, adminGuard, affiliateController.adminProcessPayout);
router.get('/admin/affiliates', authMiddleware, adminGuard, affiliateController.adminList);
router.get('/admin/affiliates/:id', authMiddleware, adminGuard, affiliateController.adminDetail);
router.put('/admin/affiliates/:id/commission', authMiddleware, adminGuard, affiliateController.adminSetCommission);
router.put('/admin/affiliates/:id/status', authMiddleware, adminGuard, affiliateController.adminUpdateStatus);

module.exports = router;
