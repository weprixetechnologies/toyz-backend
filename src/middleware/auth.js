const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const { query } = require('../config/db');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, jwtConfig.secret);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired access token' });
    }

    const users = await query(
      'SELECT id, name, email, phone, role, status, gstin, referral_code, affiliate_id, segment_tags FROM users WHERE id = ? AND deleted_at IS NULL',
      [decoded.id]
    );

    if (!users || users.length === 0) {
      return res.status(401).json({ success: false, message: 'User account not found' });
    }

    const user = users[0];
    if (user.status === 'banned') {
      return res.status(403).json({ success: false, message: 'Account has been banned' });
    }
    if (user.status === 'inactive') {
      return res.status(403).json({ success: false, message: 'Account is inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, jwtConfig.secret);
        const users = await query('SELECT id, name, email, phone, role, status FROM users WHERE id = ? AND deleted_at IS NULL', [decoded.id]);
        if (users && users.length > 0 && users[0].status === 'active') {
          req.user = users[0];
        }
      } catch (err) {
        // Ignore token errors for optional auth
      }
    }
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  authMiddleware,
  optionalAuth
};
