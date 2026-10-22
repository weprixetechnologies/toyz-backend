const { query } = require('../../config/db');

/**
 * Public: POST /api/v1/leads
 * Receives lead submission from floating contact form, contact page, or chatbot
 */
async function createLead(req, res, next) {
  try {
    const { name, phone, address, requirement, source } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Please enter your full name (at least 2 characters).' });
    }

    if (!phone || typeof phone !== 'string' || phone.trim().length < 7) {
      return res.status(400).json({ success: false, message: 'Please enter a valid phone number (at least 7 digits).' });
    }

    if (!requirement || typeof requirement !== 'string' || requirement.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'Please tell us your requirement or message.' });
    }

    const trimmedName = name.trim().slice(0, 150);
    const trimmedPhone = phone.trim().slice(0, 25);
    const trimmedAddress = address && typeof address === 'string' ? address.trim().slice(0, 1000) : null;
    const trimmedReq = requirement.trim().slice(0, 2000);
    const leadSource = (source && typeof source === 'string') ? source.trim().slice(0, 50) : 'floating_widget';

    const insertResult = await query(
      `INSERT INTO leads (name, phone, address, requirement, source, status)
       VALUES (?, ?, ?, ?, ?, 'new')`,
      [trimmedName, trimmedPhone, trimmedAddress, trimmedReq, leadSource]
    );

    return res.status(201).json({
      success: true,
      message: 'Thank you! Your inquiry has been submitted successfully. Our team will reach out to you shortly.',
      data: {
        leadId: insertResult.insertId
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: GET /api/v1/leads/admin
 * Returns paginated leads with filters and statistics
 */
async function getLeadsAdmin(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const { status, source, search } = req.query;

    const whereClauses = [];
    const params = [];

    if (status && status !== 'all') {
      whereClauses.push('status = ?');
      params.push(status);
    }

    if (source && source !== 'all') {
      whereClauses.push('source = ?');
      params.push(source);
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereClauses.push('(name LIKE ? OR phone LIKE ? OR requirement LIKE ? OR address LIKE ?)');
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Query paginated items
    const [leads, countRows, statsRows] = await Promise.all([
      query(
        `SELECT id, name, phone, address, requirement, source, status, notes, created_at, updated_at
         FROM leads
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      query(
        `SELECT COUNT(*) as total FROM leads ${whereSql}`,
        params
      ),
      query(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
           SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) as contacted_count,
           SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
           SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted_count,
           SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_count,
           SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as today_count
         FROM leads`
      )
    ]);

    const total = countRows[0]?.total || 0;
    const stats = statsRows[0] || {
      total: 0,
      new_count: 0,
      contacted_count: 0,
      in_progress_count: 0,
      converted_count: 0,
      closed_count: 0,
      today_count: 0
    };

    return res.json({
      success: true,
      data: {
        leads,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        stats: {
          total: Number(stats.total) || 0,
          new: Number(stats.new_count) || 0,
          contacted: Number(stats.contacted_count) || 0,
          in_progress: Number(stats.in_progress_count) || 0,
          converted: Number(stats.converted_count) || 0,
          closed: Number(stats.closed_count) || 0,
          today: Number(stats.today_count) || 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: PATCH /api/v1/leads/admin/:id/status
 */
async function updateLeadStatusAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const allowedStatuses = ['new', 'contacted', 'in_progress', 'converted', 'closed'];

    const updates = [];
    const params = [];

    if (status !== undefined) {
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Allowed values: ${allowedStatuses.join(', ')}`
        });
      }
      updates.push('status = ?');
      params.push(status);
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(typeof notes === 'string' ? notes.trim() : null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update provided' });
    }

    params.push(id);
    const result = await query(
      `UPDATE leads SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    return res.json({
      success: true,
      message: 'Lead updated successfully'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: DELETE /api/v1/leads/admin/:id
 */
async function deleteLeadAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM leads WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    return res.json({
      success: true,
      message: 'Lead deleted successfully'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createLead,
  getLeadsAdmin,
  updateLeadStatusAdmin,
  deleteLeadAdmin
};
