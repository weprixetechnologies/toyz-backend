const express = require('express');
const router = express.Router();
const ordersController = require('./ordersController');
const resellerApprovalController = require('./resellerApprovalController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const activityLogger = require('../../middleware/activityLogger');

// Customer / User Orders
router.post('/orders', authMiddleware, ordersController.placeOrder);
router.get('/orders', authMiddleware, ordersController.listOwnOrders);
router.get('/orders/:id', authMiddleware, ordersController.getOwnOrderDetail);
router.get('/orders/:id/invoice', authMiddleware, ordersController.downloadInvoice);
router.post('/orders/:id/cancel', authMiddleware, ordersController.cancelOwnOrder);

// Reseller Order Approval Workflows
router.get('/admin/orders/reseller-pending', authMiddleware, roleGuard('admin', 'superadmin'), resellerApprovalController.listPendingResellerOrders);
router.post('/admin/orders/:id/approve', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('reseller', 'approve_reseller_order'), resellerApprovalController.approveResellerOrder);
router.put('/admin/orders/:id/items/:itemId/unit-price', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('orders', 'edit_unit_price'), resellerApprovalController.editAdminUnitPrice);
router.put('/admin/orders/:id/items/:itemId', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('orders', 'update_order_item'), resellerApprovalController.updateAdminOrderItem);

// Admin Orders
router.get('/admin/orders', authMiddleware, roleGuard('admin', 'superadmin', 'support_agent', 'inventory_manager'), ordersController.listAdminOrders);
router.get('/admin/orders/:id', authMiddleware, roleGuard('admin', 'superadmin', 'support_agent', 'inventory_manager'), ordersController.getAdminOrderDetail);
router.get('/admin/orders/:id/packing-slip', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), ordersController.downloadPackingSlip);
router.put('/admin/orders/:id/status', authMiddleware, roleGuard('admin', 'superadmin', 'support_agent'), activityLogger('orders', 'update_order_status'), ordersController.updateOrderStatus);
router.put('/admin/orders/:id/shipping', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('orders', 'update_order_shipping'), ordersController.updateOrderShipping);
router.post('/admin/orders/bulk-status', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('orders', 'bulk_update_status'), ordersController.bulkUpdateOrderStatus);

module.exports = router;
