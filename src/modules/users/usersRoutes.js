const express = require('express');
const router = express.Router();
const usersController = require('./usersController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const activityLogger = require('../../middleware/activityLogger');

// Own Profile routes
router.get('/profile', authMiddleware, usersController.getOwnProfile);
router.put('/profile', authMiddleware, usersController.updateOwnProfile);
router.put('/profile/password', authMiddleware, usersController.changeOwnPassword);

// Own Addresses routes
router.get('/addresses', authMiddleware, usersController.listOwnAddresses);
router.post('/addresses', authMiddleware, usersController.addOwnAddress);
router.put('/addresses/:id', authMiddleware, usersController.updateOwnAddress);
router.delete('/addresses/:id', authMiddleware, usersController.deleteOwnAddress);
router.post('/addresses/:id/default', authMiddleware, usersController.setDefaultAddress);

// Admin Users Management routes
router.get('/', authMiddleware, roleGuard('admin', 'superadmin'), usersController.listUsers);
router.get('/:id', authMiddleware, roleGuard('admin', 'superadmin'), usersController.getUserById);
router.get('/:id/orders', authMiddleware, roleGuard('admin', 'superadmin', 'support_agent'), usersController.getUserOrders);
router.put('/:id', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('users', 'update_user'), usersController.updateUser);
router.delete('/:id', authMiddleware, roleGuard('superadmin'), activityLogger('users', 'delete_user'), usersController.deleteUser);
router.post('/:id/ban', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('users', 'ban_user'), usersController.banUser);
router.post('/:id/segment-tags', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('users', 'update_segment_tags'), usersController.updateSegmentTags);

module.exports = router;
