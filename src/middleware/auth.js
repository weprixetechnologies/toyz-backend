const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const { query } = require('../config/db');
const LRUCache = require('../cache/lruCache');

// O(1) bounded LRU cache for authenticated user records (avoids a DB round-trip on every request)
const userAuthCache = new LRUCache(1000, 30000);

function invalidateUserAuthCache(userId) {
  if (userId !== undefined && userId !== null) {
    userAuthCache.delete(String(userId));
  }
}

async function fetchActiveUser(userId) {
  const cacheKey = String(userId);
  const cached = userAuthCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  return userAuthCache.singleFlight(`auth:${cacheKey}`, async () => {
    const retry = userAuthCache.get(cacheKey);
    if (retry !== undefined) return retry;

    const users = await query(
      'SELECT id, name, email, phone, role, status, gstin, referral_code, affiliate_id, segment_tags FROM users WHERE id = ? AND deleted_at IS NULL',
      [userId]
    );
    const user = users && users.length > 0 ? users[0] : null;
    if (user) {
      userAuthCache.set(cacheKey, user, 30000);
    }
    return user;
  });
}

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, jwtConfig.secret);
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired access token' });
    }

    const user = await fetchActiveUser(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User account not found' });
    }

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
        const user = await fetchActiveUser(decoded.id);
        if (user && user.status === 'active') {
          req.user = user;
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
  optionalAuth,
  invalidateUserAuthCache
};
