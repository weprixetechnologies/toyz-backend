const express = require('express');
const router = express.Router();
const controller = require('./sectionTagsController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

router.get('/', authMiddleware, roleGuard('admin'), controller.getAllTags);
router.post('/', authMiddleware, roleGuard('admin'), controller.createTag);
router.put('/:id', authMiddleware, roleGuard('admin'), controller.updateTag);
router.delete('/:id', authMiddleware, roleGuard('admin'), controller.deleteTag);
router.post('/:id/products', authMiddleware, roleGuard('admin'), controller.addProducts);
router.delete('/:id/products', authMiddleware, roleGuard('admin'), controller.removeProducts);

module.exports = router;
