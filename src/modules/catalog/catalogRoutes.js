const express = require('express');
const categoriesController = require('./categoriesController');
const brandsController = require('./brandsController');
const attributesController = require('./attributesController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const activityLogger = require('../../middleware/activityLogger');

const router = express.Router();

// Categories
router.get('/categories', categoriesController.listCategories);
router.get('/categories/:slug', categoriesController.getCategoryBySlug);
router.post('/categories', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('categories', 'create_category'), categoriesController.createCategory);
router.put('/categories/reorder', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('categories', 'reorder_categories'), categoriesController.reorderCategories);
router.put('/categories/:id', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('categories', 'update_category'), categoriesController.updateCategory);
router.delete('/categories/:id', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('categories', 'delete_category'), categoriesController.deleteCategory);

// Brands
router.get('/brands', brandsController.listBrands);
router.get('/brands/:slug', brandsController.getBrandBySlug);
router.post('/brands', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('brands', 'create_brand'), brandsController.createBrand);
router.put('/brands/:id', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('brands', 'update_brand'), brandsController.updateBrand);
router.delete('/brands/:id', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('brands', 'delete_brand'), brandsController.deleteBrand);

// Attributes
router.get('/attributes', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), attributesController.listAttributeGroups);
router.post('/attributes', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('attributes', 'create_attribute_group'), attributesController.createAttributeGroup);
router.post('/attributes/:groupId/values', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('attributes', 'add_attribute_value'), attributesController.addAttributeValue);
router.put('/attributes/:groupId/values/:valId', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('attributes', 'update_attribute_value'), attributesController.updateAttributeValue);
router.delete('/attributes/:groupId/values/:valId', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('attributes', 'delete_attribute_value'), attributesController.deleteAttributeValue);

module.exports = router;
