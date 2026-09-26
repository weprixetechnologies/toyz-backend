require('dotenv').config();

module.exports = {
  secret: process.env.JWT_SECRET || 'fallback_jwt_secret',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback_jwt_refresh_secret',
  expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
};
