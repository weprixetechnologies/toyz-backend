const express = require('express');
const badgesController = require('./badgesController');
const { authMiddleware, optionalAuth } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const activityLogger = require('../../middleware/activityLogger');

const router = express.Router();

// Public route to fetch active badges or all badges
router.get('/', optionalAuth, badgesController.listBadges);
router.get('/:id', optionalAuth, badgesController.getBadgeById);

// Admin protected routes
router.post(
  '/',
  authMiddleware,
  roleGuard('admin', 'superadmin', 'inventory_manager'),
  activityLogger('badges', 'create_badge'),
  badgesController.createBadge
);

router.put(
  '/:id',
  authMiddleware,
  roleGuard('admin', 'superadmin', 'inventory_manager'),
  activityLogger('badges', 'update_badge'),
  badgesController.updateBadge
);

router.delete(
  '/:id',
  authMiddleware,
  roleGuard('admin', 'superadmin'),
  activityLogger('badges', 'delete_badge'),
  badgesController.deleteBadge
);

router.post(
  '/:id/products',
  authMiddleware,
  roleGuard('admin', 'superadmin', 'inventory_manager'),
  activityLogger('badges', 'assign_badge_products'),
  badgesController.assignBadgeProducts
);

module.exports = router;
