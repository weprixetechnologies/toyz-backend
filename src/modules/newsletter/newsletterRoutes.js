const express = require('express');
const router = express.Router();
const newsletterController = require('./newsletterController');
const { authMiddleware } = require('../../middleware/auth');
const roleGuard = require('../../middleware/roleGuard');

router.post('/subscribe', newsletterController.subscribe);
router.get('/admin/subscribers', authMiddleware, roleGuard('admin', 'superadmin'), newsletterController.getSubscribersAdmin);

module.exports = router;
