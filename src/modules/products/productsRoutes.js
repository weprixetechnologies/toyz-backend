const express = require('express');
const multer = require('multer');
const productsController = require('./productsController');
const wishlistController = require('../wishlist/wishlistController');
const { authMiddleware, optionalAuth } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const activityLogger = require('../../middleware/activityLogger');

const router = express.Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/', optionalAuth, productsController.listProducts);
router.get('/low-stock', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), productsController.listLowStockProducts);
router.get('/recently-viewed', authMiddleware, wishlistController.getRecentlyViewed);
router.get('/export', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), productsController.exportProducts);
router.post('/import', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('products', 'import_products'), productsController.importProducts);
router.post('/:id/viewed', authMiddleware, wishlistController.recordView);
router.get('/:slug', optionalAuth, productsController.getProductBySlug);

// Inventory Log & Adjustment
router.get('/:id/inventory', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), productsController.getInventoryLog);
router.post('/:id/inventory/adjust', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('inventory', 'adjust_inventory'), productsController.adjustInventory);

router.post('/', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('products', 'create_product'), productsController.createProduct);
router.put('/:id', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('products', 'update_product'), productsController.updateProduct);
router.delete('/:id', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('products', 'delete_product'), productsController.deleteProduct);

// Images
router.post('/:id/images', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), upload.single('image'), activityLogger('products', 'upload_image'), productsController.uploadProductImage);
router.delete('/:id/images/:imgId', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('products', 'delete_image'), productsController.deleteProductImage);
router.put('/:id/images/reorder', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('products', 'reorder_images'), productsController.reorderProductImages);

// Variants
router.get('/:id/variants', productsController.listVariants);
router.post('/:id/variants', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('products', 'create_variant'), productsController.createVariant);
router.put('/:id/variants/:varId', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('products', 'update_variant'), productsController.updateVariant);
router.delete('/:id/variants/:varId', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('products', 'delete_variant'), productsController.deleteVariant);

module.exports = router;
