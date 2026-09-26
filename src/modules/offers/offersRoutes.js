const express = require('express');
const router = express.Router();
const offersController = require('./offersController');
const { authMiddleware, optionalAuth } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const activityLogger = require('../../middleware/activityLogger');

// Public / User Offers Validation & List
router.get('/offers', offersController.listOffers);
router.post('/offers/validate', optionalAuth, offersController.validateCartOffers);

// Admin Offers Management
router.get('/admin/offers', authMiddleware, roleGuard('admin', 'superadmin'), offersController.listOffers);
router.get('/admin/offers/:id', authMiddleware, roleGuard('admin', 'superadmin'), offersController.getOfferById);
router.post('/admin/offers', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('offers', 'create_offer'), offersController.createOffer);
router.put('/admin/offers/:id', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('offers', 'update_offer'), offersController.updateOffer);
router.delete('/admin/offers/:id', authMiddleware, roleGuard('superadmin'), activityLogger('offers', 'delete_offer'), offersController.deleteOffer);

// Admin Coupons Management
router.get('/admin/coupons', authMiddleware, roleGuard('admin', 'superadmin'), offersController.listCoupons);
router.post('/admin/coupons', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('offers', 'create_coupon'), offersController.createCoupon);
router.put('/admin/coupons/:id', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('offers', 'update_coupon'), offersController.updateCoupon);
router.delete('/admin/coupons/:id', authMiddleware, roleGuard('superadmin'), activityLogger('offers', 'delete_coupon'), offersController.deleteCoupon);
router.post('/admin/coupons/bulk-generate', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('offers', 'bulk_generate_coupons'), offersController.bulkGenerateCoupons);

module.exports = router;
