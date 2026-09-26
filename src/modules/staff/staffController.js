const { query } = require('../../config/db');
const bcrypt = require('bcryptjs');

class StaffController {
  /**
   * GET /admin/staff — List all staff users and their permissions
   */
  async listStaff(req, res, next) {
    try {
      const staffUsers = await query(
        `SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.created_at, ap.permissions
         FROM users u
         LEFT JOIN admin_permissions ap ON u.id = ap.user_id
         WHERE u.role IN ('admin', 'inventory_manager', 'support_agent', 'superadmin') AND u.deleted_at IS NULL
         ORDER BY u.id DESC`
      );

      const parsed = (staffUsers || []).map(u => ({
        ...u,
        permissions: u.permissions ? (typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions) : null
      }));

      res.json({
        success: true,
        data: parsed,
        message: 'Admin staff users listed.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /admin/staff — Create a new staff account
   */
  async createStaff(req, res, next) {
    try {
      const { name, email, phone, password, role = 'admin', permissions } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
      }

      if (!['admin', 'inventory_manager', 'support_agent'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid staff role specified.' });
      }

      const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing && existing.length > 0) {
        return res.status(400).json({ success: false, message: 'Email address is already in use.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userRes = await query(
        `INSERT INTO users (name, email, phone, password_hash, role, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [name, email, phone || null, passwordHash, role]
      );

      const staffUserId = userRes.insertId;

      const defaultPerms = permissions || {
        orders: { view: true, edit: role !== 'support_agent', delete: false },
        products: { view: true, edit: role === 'inventory_manager' || role === 'admin', delete: false },
        reports: { view: role === 'admin', edit: false, delete: false },
        users: { view: true, edit: role === 'admin', delete: false },
        settings: { view: role === 'admin', edit: false, delete: false }
      };

      await query(
        `INSERT INTO admin_permissions (user_id, permissions)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE permissions = VALUES(permissions)`,
        [staffUserId, JSON.stringify(defaultPerms)]
      );

      res.status(201).json({
        success: true,
        data: { id: staffUserId, name, email, role, permissions: defaultPerms },
        message: 'Staff account created successfully.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/staff/:id — Update staff role, status, and permissions
   */
  async updateStaff(req, res, next) {
    try {
      const staffUserId = req.params.id;
      const { role, status, permissions } = req.body;

      const users = await query('SELECT id FROM users WHERE id = ?', [staffUserId]);
      if (!users || users.length === 0) {
        return res.status(404).json({ success: false, message: 'Staff user not found.' });
      }

      if (role || status) {
        await query(
          `UPDATE users 
           SET role = COALESCE(?, role),
               status = COALESCE(?, status)
           WHERE id = ?`,
          [role, status, staffUserId]
        );
      }

      if (permissions) {
        await query(
          `INSERT INTO admin_permissions (user_id, permissions)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE permissions = VALUES(permissions)`,
          [staffUserId, JSON.stringify(permissions)]
        );
      }

      const updated = await query(
        `SELECT u.id, u.name, u.email, u.role, u.status, ap.permissions
         FROM users u
         LEFT JOIN admin_permissions ap ON u.id = ap.user_id
         WHERE u.id = ?`,
        [staffUserId]
      );

      const user = updated[0];
      user.permissions = user.permissions ? (typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions) : null;

      res.json({
        success: true,
        data: user,
        message: 'Staff user updated successfully.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/staff/:id — Remove staff account
   */
  async deleteStaff(req, res, next) {
    try {
      const staffUserId = req.params.id;
      await query('UPDATE users SET deleted_at = NOW(), status = "inactive" WHERE id = ?', [staffUserId]);
      res.json({
        success: true,
        data: { id: staffUserId },
        message: 'Staff user removed.'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new StaffController();
