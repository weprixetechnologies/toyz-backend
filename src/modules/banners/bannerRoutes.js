const express = require('express');
const router = express.Router();
const controller = require('./bannerController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

// Public routes
router.get('/', controller.listBanners);
router.get('/:id', controller.getBanner);

// Admin routes
router.post('/', authMiddleware, roleGuard('admin'), controller.createBanner);
router.put('/:id', authMiddleware, roleGuard('admin'), controller.updateBanner);
router.delete('/:id', authMiddleware, roleGuard('admin'), controller.deleteBanner);

module.exports = router;
