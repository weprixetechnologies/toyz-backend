const { query } = require('../config/db');

function roleGuard(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Superadmin bypasses role check
    if (req.user.role === 'superadmin') {
      return next();
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: role '${req.user.role}' is not authorized to access this resource`
      });
    }

    next();
  };
}

function permissionGuard(moduleName, action = 'view') {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      if (req.user.role === 'superadmin') {
        return next();
      }

      const rows = await query('SELECT permissions FROM admin_permissions WHERE user_id = ?', [req.user.id]);
      if (rows && rows.length > 0) {
        const perms = typeof rows[0].permissions === 'string' ? JSON.parse(rows[0].permissions) : rows[0].permissions;
        if (perms && perms[moduleName] && perms[moduleName][action] === true) {
          return next();
        }
      }

      // Admin role default access if permissions row not defined
      if (req.user.role === 'admin') {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: `Forbidden: missing '${moduleName}:${action}' permission`
      });
    } catch (error) {
      next(error);
    }
  };
}

roleGuard.permissionGuard = permissionGuard;

module.exports = roleGuard;
