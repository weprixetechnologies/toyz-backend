const eventBus = require('../events/bus');

function activityLogger(moduleName, actionName) {
  return (req, res, next) => {
    const originalJson = res.json;

    res.json = function (body) {
      res.json = originalJson;

      if (res.statusCode >= 200 && res.statusCode < 300) {
        const payload = {
          user_id: req.user?.id || null,
          user_role: req.user?.role || 'anonymous',
          user_name: req.user?.name || 'Unknown',
          action: actionName || `${req.method}_${req.baseUrl}${req.path}`,
          module: moduleName || 'general',
          target_id: req.params?.id || req.body?.id || null,
          before_state: req.beforeState || null,
          after_state: body,
          ip_address: req.ip || req.connection?.remoteAddress,
          user_agent: req.headers['user-agent']
        };

        eventBus.emit('activity.logged', payload);
      }

      return originalJson.call(this, body);
    };

    next();
  };
}

module.exports = activityLogger;
