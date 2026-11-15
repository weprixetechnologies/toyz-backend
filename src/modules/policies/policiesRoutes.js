const express = require('express');
const router = express.Router();
const policiesController = require('./policiesController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

// Public routes
router.get('/', policiesController.getPublicPolicies);
router.get('/:slug', policiesController.getPublicPolicyBySlug);

// Admin routes
router.get('/admin/all', authMiddleware, roleGuard('admin', 'superadmin'), policiesController.getAllPoliciesAdmin);
router.get('/admin/:id', authMiddleware, roleGuard('admin', 'superadmin'), policiesController.getPolicyByIdAdmin);
router.post('/admin', authMiddleware, roleGuard('admin', 'superadmin'), policiesController.createPolicyAdmin);
router.put('/admin/:id', authMiddleware, roleGuard('admin', 'superadmin'), policiesController.updatePolicyAdmin);
router.delete('/admin/:id', authMiddleware, roleGuard('admin', 'superadmin'), policiesController.deletePolicyAdmin);

module.exports = router;
