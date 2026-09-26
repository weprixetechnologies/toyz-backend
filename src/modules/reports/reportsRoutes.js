const express = require('express');
const router = express.Router();
const reportsController = require('./reportsController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');
const adminGuard = roleGuard('admin', 'superadmin');

// Admin Analytics & Reporting Endpoints
router.get('/dashboard', authMiddleware, adminGuard, reportsController.getDashboardKPIs);
router.get('/sales', authMiddleware, adminGuard, reportsController.getSalesReport);
router.get('/sales/export', authMiddleware, adminGuard, reportsController.exportSalesReport);
router.get('/orders', authMiddleware, adminGuard, reportsController.getOrderReport);
router.get('/products', authMiddleware, adminGuard, reportsController.getProductReport);
router.get('/customers', authMiddleware, adminGuard, reportsController.getCustomerReport);
router.get('/affiliates', authMiddleware, adminGuard, reportsController.getAffiliateReport);
router.get('/inventory', authMiddleware, adminGuard, reportsController.getInventoryReport);

module.exports = router;
