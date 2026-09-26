const express = require('express');
const router = express.Router();
const staffController = require('./staffController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

// Superadmin-only Staff Management Endpoints
router.get('/staff', authMiddleware, roleGuard('superadmin'), staffController.listStaff);
router.post('/staff', authMiddleware, roleGuard('superadmin'), staffController.createStaff);
router.put('/staff/:id', authMiddleware, roleGuard('superadmin'), staffController.updateStaff);
router.delete('/staff/:id', authMiddleware, roleGuard('superadmin'), staffController.deleteStaff);

module.exports = router;
