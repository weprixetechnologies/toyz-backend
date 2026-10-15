const express = require('express');
const router = express.Router();
const blogsController = require('./blogsController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

// Public routes
router.get('/', blogsController.getBlogs);
router.get('/categories', blogsController.getBlogCategories);
router.get('/:slug', blogsController.getBlogBySlug);

// Admin routes
router.get('/admin/all', authMiddleware, roleGuard('admin', 'superadmin'), blogsController.getAllBlogsAdmin);
router.post('/admin', authMiddleware, roleGuard('admin', 'superadmin'), blogsController.createBlogAdmin);
router.put('/admin/:id', authMiddleware, roleGuard('admin', 'superadmin'), blogsController.updateBlogAdmin);
router.delete('/admin/:id', authMiddleware, roleGuard('admin', 'superadmin'), blogsController.deleteBlogAdmin);

module.exports = router;
