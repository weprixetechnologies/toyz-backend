const express = require('express');
const router = express.Router();
const authController = require('./authController');
const { authMiddleware } = require('../../middleware/auth');
const createRateLimiter = require('../../middleware/rateLimiter');

const otpRateLimiter = createRateLimiter({ windowSec: 60, maxHits: 5, prefix: 'otp_rl' });
const loginRateLimiter = createRateLimiter({ windowSec: 60, maxHits: 10, prefix: 'login_rl' });

router.post('/register', authController.register);
router.post('/login', loginRateLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authMiddleware, authController.logout);
router.post('/logout-all', authMiddleware, authController.logoutAll);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/send-otp', otpRateLimiter, authController.sendOtp);
router.post('/verify-otp', otpRateLimiter, authController.verifyOtp);
router.post('/verify-email', authController.verifyEmail);
router.get('/me', authMiddleware, authController.me);

module.exports = router;
