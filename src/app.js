const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const initEventListeners = require('./events/listeners');

// Import Route Modules
const authRoutes = require('./modules/auth/authRoutes');
const usersRoutes = require('./modules/users/usersRoutes');
const catalogRoutes = require('./modules/catalog/catalogRoutes');
const productsRoutes = require('./modules/products/productsRoutes');
const cartRoutes = require('./modules/cart/cartRoutes');
const ordersRoutes = require('./modules/orders/ordersRoutes');
const paymentsRoutes = require('./modules/payments/paymentsRoutes');
const settingsRoutes = require('./modules/settings/settingsRoutes');
const smsAdminRoutes = require('./modules/sms/smsAdminRoutes');
const offersRoutes = require('./modules/offers/offersRoutes');
const reviewsRoutes = require('./modules/reviews/reviewsRoutes');
const resellerRoutes = require('./modules/resellers/resellerRoutes');
const bulkPricingRoutes = require('./modules/bulkPricing/bulkPricingRoutes');
const affiliateRoutes = require('./modules/affiliates/affiliateRoutes');
const shippingRoutes = require('./modules/shipping/shippingRoutes');
const wishlistRoutes = require('./modules/wishlist/wishlistRoutes');
const seoRoutes = require('./modules/seo/seoRoutes');
const staffRoutes = require('./modules/staff/staffRoutes');
const reportsRoutes = require('./modules/reports/reportsRoutes');
const activityLogRoutes = require('./modules/activityLog/activityLogRoutes');
const bannerRoutes = require('./modules/banners/bannerRoutes');
const homepageRoutes = require('./modules/homepage/homepageRoutes');
const sectionTagsRoutes = require('./modules/sectionTags/sectionTagsRoutes');


const storageRoutes = require('./modules/storage/storageRoutes');
const badgesRoutes = require('./modules/badges/badgesRoutes');

const app = express();

// Global Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Endpoint Request Logger Middleware
app.use((req, res, next) => {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const color = statusCode >= 500 ? '\x1b[31m' : statusCode >= 400 ? '\x1b[33m' : '\x1b[32m';
    const reset = '\x1b[0m';

    console.log(
      `[HTTP LOG] [${new Date().toLocaleTimeString()}] ${method} ${originalUrl} -> ${color}${statusCode}${reset} (${duration}ms)`
    );
  });

  next();
});

// Lightweight Cookie Parser Middleware
app.use((req, res, next) => {
  req.cookies = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      req.cookies[parts.shift().trim()] = decodeURIComponent(parts.join('='));
    });
  }
  next();
});

// Register Async Event Listeners
initEventListeners();

// Boot-time sync for Payment Gateway Manager
const { syncGatewaysToDb } = require('./modules/payments/gateways');
syncGatewaysToDb();

// Mount API v1 Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1', paymentsRoutes);
app.use('/api/v1', catalogRoutes);
app.use('/api/v1', ordersRoutes);
app.use('/api/v1', settingsRoutes);
app.use('/api/v1', smsAdminRoutes);
app.use('/api/v1', offersRoutes);
app.use('/api/v1', reviewsRoutes);
app.use('/api/v1', resellerRoutes);
app.use('/api/v1', bulkPricingRoutes);
app.use('/api/v1/affiliate', affiliateRoutes);
app.use('/api/v1', shippingRoutes);
app.use('/api/v1', wishlistRoutes);
app.use('/api/v1/seo', seoRoutes);
app.use('/api/v1/admin', staffRoutes);
app.use('/api/v1/admin/reports', reportsRoutes);
app.use('/api/v1/admin', activityLogRoutes);
app.use('/api/v1/banners', bannerRoutes);
app.use('/api/v1/homepage', homepageRoutes);
app.use('/api/v1/section-tags', sectionTagsRoutes);


app.use('/api/v1/storage', storageRoutes);
app.use('/api/v1/badges', badgesRoutes);

// Health Check & Sitemap Routes
const seoController = require('./modules/seo/seoController');
app.get('/sitemap.xml', (req, res, next) => seoController.generateSitemap(req, res, next));

app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, message: 'E-Commerce Platform API active', timestamp: new Date() });
});

// Centralized Error Handler
app.use(errorHandler);

module.exports = app;
