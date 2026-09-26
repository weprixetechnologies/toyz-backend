const express = require('express');
const router = express.Router();
const wishlistController = require('./wishlistController');
const { authMiddleware } = require('../../middleware/auth');

// Wishlist Endpoints
router.get('/wishlist', authMiddleware, wishlistController.getWishlist);
router.post('/wishlist', authMiddleware, wishlistController.addToWishlist);
router.delete('/wishlist/:productId', authMiddleware, wishlistController.removeFromWishlist);
router.post('/wishlist/:productId/move-to-cart', authMiddleware, wishlistController.moveToCart);

// Recently Viewed Endpoints
router.get('/products/recently-viewed', authMiddleware, wishlistController.getRecentlyViewed);
router.post('/products/:id/viewed', authMiddleware, wishlistController.recordView);

module.exports = router;
