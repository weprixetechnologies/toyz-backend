const express = require('express');
const router = express.Router();
const resellerController = require('./resellerController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const activityLogger = require('../../middleware/activityLogger');

// Customer Application & Retailer Own Panel
router.post('/reseller/apply', authMiddleware, resellerController.applyReseller);
router.get('/reseller/profile', authMiddleware, roleGuard('retailer'), resellerController.getOwnProfile);
router.get('/reseller/products', authMiddleware, roleGuard('retailer'), resellerController.getResellerProducts);
router.get('/reseller/orders', authMiddleware, roleGuard('retailer'), resellerController.getOwnResellerOrders);
router.get('/reseller/proforma/:orderId', authMiddleware, roleGuard('retailer', 'admin', 'superadmin'), resellerController.getProformaInvoice);
router.get('/reseller/credit', authMiddleware, roleGuard('retailer'), resellerController.getOwnCredit);

// Admin Reseller Management
router.get('/admin/resellers', authMiddleware, roleGuard('admin', 'superadmin'), resellerController.listAdminResellers);
router.get('/admin/resellers/:id', authMiddleware, roleGuard('admin', 'superadmin'), resellerController.getAdminResellerById);
router.put('/admin/resellers/:id/approve', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('reseller', 'approve_reseller'), resellerController.approveReseller);
router.put('/admin/resellers/:id/reject', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('reseller', 'reject_reseller'), resellerController.rejectReseller);
router.put('/admin/resellers/:id/suspend', authMiddleware, roleGuard('superadmin'), activityLogger('reseller', 'suspend_reseller'), resellerController.suspendReseller);
router.put('/admin/resellers/:id/discount', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('reseller', 'set_reseller_global_discount'), resellerController.setGlobalDiscount);
router.put('/admin/resellers/:id/credit', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('reseller', 'set_reseller_credit_limit'), resellerController.setCreditLimit);
router.put('/admin/resellers/:id/product-discount/:productId', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('reseller', 'set_reseller_product_discount'), resellerController.setProductDiscount);

module.exports = router;
