const express = require('express');
const router = express.Router();
const leadsController = require('./leadsController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

// Public route: submit lead
router.post('/', leadsController.createLead);

// Admin routes: protected
router.get('/admin', authMiddleware, roleGuard('admin', 'superadmin'), leadsController.getLeadsAdmin);
router.patch('/admin/:id/status', authMiddleware, roleGuard('admin', 'superadmin'), leadsController.updateLeadStatusAdmin);
router.delete('/admin/:id', authMiddleware, roleGuard('admin', 'superadmin'), leadsController.deleteLeadAdmin);

module.exports = router;
