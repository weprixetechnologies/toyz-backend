const express = require('express');
const router = express.Router();
const bulkPricingController = require('./bulkPricingController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const activityLogger = require('../../middleware/activityLogger');

router.get('/products/:id/bulk-pricing', authMiddleware, bulkPricingController.listBulkTiers);
router.post('/products/:id/bulk-pricing', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('bulk_pricing', 'create_bulk_tier'), bulkPricingController.createBulkTier);
router.put('/products/:id/bulk-pricing/:tierId', authMiddleware, roleGuard('admin', 'superadmin', 'inventory_manager'), activityLogger('bulk_pricing', 'update_bulk_tier'), bulkPricingController.updateBulkTier);
router.delete('/products/:id/bulk-pricing/:tierId', authMiddleware, roleGuard('admin', 'superadmin'), activityLogger('bulk_pricing', 'delete_bulk_tier'), bulkPricingController.deleteBulkTier);

module.exports = router;
