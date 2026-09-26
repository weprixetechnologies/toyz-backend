const { query } = require('../../config/db');

class ActivityLogController {
  /**
   * GET /admin/activity-log — Paginated audit log
   */
  async listLogs(req, res, next) {
    try {
      const { user_id, module_name, action, page = 1, limit = 20 } = req.query;
      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (user_id) {
        whereClause += ' AND al.user_id = ?';
        params.push(user_id);
      }
      if (module_name) {
        whereClause += ' AND al.module = ?';
        params.push(module_name);
      }
      if (action) {
        whereClause += ' AND al.action = ?';
        params.push(action);
      }

      const [{ total }] = await query(`SELECT COUNT(*) as total FROM activity_log al ${whereClause}`, params);

      const logs = await query(
        `SELECT al.*, al.module AS module_name, u.name AS user_name, u.email AS user_email, u.role AS user_role
         FROM activity_log al
         LEFT JOIN users u ON al.user_id = u.id
         ${whereClause}
         ORDER BY al.id DESC
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limit, 10), offset]
      );

      res.json({
        success: true,
        data: {
          logs: logs || [],
          pagination: {
            total: parseInt(total, 10),
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            pages: Math.ceil(total / limit)
          }
        },
        message: 'Activity log listed.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/activity-log/export — Export activity log to CSV
   */
  async exportLogs(req, res, next) {
    try {
      const logs = await query(
        `SELECT al.id, al.created_at, u.email AS user_email, al.module AS module_name, al.action, al.ip_address, COALESCE(al.after_state, al.before_state, '') AS details
         FROM activity_log al
         LEFT JOIN users u ON al.user_id = u.id
         ORDER BY al.id DESC
         LIMIT 1000`
      );

      let csv = 'ID,Timestamp,User Email,Module,Action,IP Address,Details\n';
      for (const log of (logs || [])) {
        const detailStr = log.details ? (typeof log.details === 'string' ? log.details : JSON.stringify(log.details)).replace(/"/g, '""') : '';
        csv += `"${log.id}","${new Date(log.created_at).toISOString()}","${log.user_email || ''}","${log.module_name}","${log.action}","${log.ip_address || ''}","${detailStr}"\n`;
      }

      res.header('Content-Type', 'text/csv');
      res.attachment('activity_log.csv');
      res.send(csv);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ActivityLogController();
