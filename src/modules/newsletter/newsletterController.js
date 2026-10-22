const { query } = require('../../config/db');

/**
 * POST /api/v1/newsletter/subscribe
 */
async function subscribe(req, res, next) {
  try {
    const { email, source } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid email address is required' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }

    await query(
      `INSERT INTO newsletter_subscribers (email, source, status)
       VALUES (?, ?, 'subscribed')
       ON DUPLICATE KEY UPDATE status = 'subscribed', updated_at = CURRENT_TIMESTAMP`,
      [trimmedEmail, source || 'blog_sidebar']
    );

    res.json({
      success: true,
      message: 'Thank you for subscribing to Provoke Playtech! Look out for exclusive deals and play tips in your inbox.'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: GET /api/v1/newsletter/admin/subscribers
 */
async function getSubscribersAdmin(req, res, next) {
  try {
    const subscribers = await query('SELECT * FROM newsletter_subscribers ORDER BY created_at DESC');
    res.json({ success: true, data: subscribers });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  subscribe,
  getSubscribersAdmin
};
