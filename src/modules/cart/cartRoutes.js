const express = require('express');
const router = express.Router();
const cartController = require('./cartController');
const { optionalAuth } = require('../../middleware/auth');

router.get('/', optionalAuth, cartController.getCart);
router.post('/items', optionalAuth, cartController.addItem);
router.put('/items/:id', optionalAuth, cartController.updateItem);
router.delete('/items/:id', optionalAuth, cartController.removeItem);
router.delete('/', optionalAuth, cartController.clearCart);

// Coupon application endpoints
router.post('/coupon', optionalAuth, cartController.applyCoupon);
router.delete('/coupon', optionalAuth, cartController.removeCoupon);
router.post('/offers', optionalAuth, cartController.applyOffers);

// Merge cart endpoint
router.post('/merge', optionalAuth, cartController.mergeCart);

module.exports = router;
