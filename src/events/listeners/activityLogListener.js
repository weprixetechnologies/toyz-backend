const eventBus = require('../bus');
const { query } = require('../../config/db');

function registerActivityLogListeners() {
  eventBus.on('activity.logged', async (data) => {
    try {
      await query(
        `INSERT INTO activity_log
          (user_id, user_role, user_name, action, module, target_id, before_state, after_state, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.user_id,
          data.user_role,
          data.user_name,
          data.action,
          data.module,
          data.target_id ? String(data.target_id) : null,
          data.before_state ? JSON.stringify(data.before_state) : null,
          data.after_state ? JSON.stringify(data.after_state) : null,
          data.ip_address,
          data.user_agent
        ]
      );
    } catch (error) {
      console.error('[ActivityLog Listener Error]:', error.message);
    }
  });
}

module.exports = registerActivityLogListeners;
