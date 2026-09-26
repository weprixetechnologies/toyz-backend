const express = require('express');
const router = express.Router();
const shippingController = require('./shippingController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const adminGuard = roleGuard('admin', 'superadmin');

// Public/Customer shipping options
router.get('/options', shippingController.getShippingOptions);
router.get('/shipping/options', shippingController.getShippingOptions);

// Customer order shipments lookup
router.get('/orders/:id/shipments', authMiddleware, shippingController.getOrderShipments);
router.get('/shipping/orders/:id/shipments', authMiddleware, shippingController.getOrderShipments);

// Admin Shipping Presets CRUD
router.get('/admin/presets', authMiddleware, adminGuard, shippingController.adminListPresets);
router.post('/admin/presets', authMiddleware, adminGuard, shippingController.adminCreatePreset);
router.put('/admin/presets/:id', authMiddleware, adminGuard, shippingController.adminUpdatePreset);
router.delete('/admin/presets/:id', authMiddleware, adminGuard, shippingController.adminDeletePreset);

router.get('/admin/shipping/presets', authMiddleware, adminGuard, shippingController.adminListPresets);
router.post('/admin/shipping/presets', authMiddleware, adminGuard, shippingController.adminCreatePreset);
router.put('/admin/shipping/presets/:id', authMiddleware, adminGuard, shippingController.adminUpdatePreset);
router.delete('/admin/shipping/presets/:id', authMiddleware, adminGuard, shippingController.adminDeletePreset);

// Admin Order Split Shipments (§6.3)
router.post('/admin/orders/:id/shipments', authMiddleware, adminGuard, shippingController.createShipment);
router.put('/admin/orders/:id/shipments/:sId', authMiddleware, adminGuard, shippingController.updateShipment);

router.post('/shipping/admin/orders/:id/shipments', authMiddleware, adminGuard, shippingController.createShipment);
router.put('/shipping/admin/orders/:id/shipments/:sId', authMiddleware, adminGuard, shippingController.updateShipment);

module.exports = router;
