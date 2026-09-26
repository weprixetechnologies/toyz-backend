const express = require('express');
const router = express.Router();
const controller = require('./homepageController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

// Public
router.get('/sections', controller.getHomepageData);

// Admin
router.get('/admin/sections', authMiddleware, roleGuard('admin'), controller.getAllSections);
router.put('/admin/sections/reorder', authMiddleware, roleGuard('admin'), controller.reorderSections);
router.post('/admin/sections', authMiddleware, roleGuard('admin'), controller.createSection);
router.put('/admin/sections/:id', authMiddleware, roleGuard('admin'), controller.updateSection);
router.delete('/admin/sections/:id', authMiddleware, roleGuard('admin'), controller.deleteSection);

// Legacy proxy to not break if some frontend is still calling custom-blocks temporarily
router.get('/custom-blocks', (req, res) => res.json({success: true, data: []}));

module.exports = router;
