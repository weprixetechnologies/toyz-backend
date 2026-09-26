const express = require('express');
const router = express.Router();
const reviewsController = require('./reviewsController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const activityLogger = require('../../middleware/activityLogger');

// Public & Customer Product Reviews
router.get('/products/:id/reviews/stats', reviewsController.getProductReviewStats);
router.get('/products/:id/reviews', reviewsController.listProductReviews);
router.post('/products/:id/reviews', authMiddleware, reviewsController.submitReview);

// User Endpoints
router.get('/user/reviews', authMiddleware, reviewsController.listUserReviews);

// Admin Review Moderation Queue
router.get('/reviews', authMiddleware, roleGuard('admin', 'superadmin', 'support_agent'), reviewsController.listAllReviews);
router.get('/reviews/:id', authMiddleware, roleGuard('admin', 'superadmin', 'support_agent'), reviewsController.getReviewById);
router.put('/reviews/:id/approve', authMiddleware, roleGuard('admin', 'superadmin', 'support_agent'), activityLogger('reviews', 'approve_review'), reviewsController.approveReview);
router.put('/reviews/:id/reject', authMiddleware, roleGuard('admin', 'superadmin', 'support_agent'), activityLogger('reviews', 'reject_review'), reviewsController.rejectReview);
router.delete('/reviews/:id', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('reviews', 'delete_review'), reviewsController.deleteReview);

module.exports = router;
