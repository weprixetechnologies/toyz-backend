const express = require('express');
const router = express.Router();
const seoController = require('./seoController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const adminGuard = roleGuard('admin', 'superadmin');

// Public Page SEO metadata & sitemap
router.get('/sitemap.xml', seoController.generateSitemap);
router.get('/pages/:key', seoController.getPageSeo);

// Admin SEO & Sitemap
router.post('/admin/generate-sitemap', authMiddleware, adminGuard, seoController.generateSitemap);
router.put('/admin/pages/:key', authMiddleware, adminGuard, seoController.updatePageSeo);

module.exports = router;
