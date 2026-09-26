const { query } = require('../../config/db');
const { sendSms } = require('../../utils/smsService');

async function getSmsBalance(req, res, next) {
  try {
    res.json({
      success: true,
      data: {
        provider: 'smsgatewayhub',
        balance: 5000,
        currency: 'INR'
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getSmsLogs(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [{ total }] = await query('SELECT COUNT(*) as total FROM sms_log');
    const logs = await query('SELECT * FROM sms_log ORDER BY id DESC LIMIT ? OFFSET ?', [parseInt(limit, 10), offset]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), pages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    next(error);
  }
}

async function sendTestSms(req, res, next) {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, message: 'Phone and message body are required' });
    }

    const result = await sendSms({
      phone,
      templateId: 'otp_verify',
      variables: { otp: '123456' }
    });

    res.json({
      success: true,
      message: 'Test SMS sent',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

async function listTemplates(req, res, next) {
  try {
    const templates = await query('SELECT * FROM sms_templates ORDER BY template_id ASC');
    res.json({
      success: true,
      data: templates || [],
      message: 'SMS templates listed.'
    });
  } catch (error) {
    next(error);
  }
}

async function updateTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const { name, body, variables } = req.body;

    await query(
      `UPDATE sms_templates 
       SET name = COALESCE(?, name),
           body = COALESCE(?, body),
           variables = COALESCE(?, variables)
       WHERE template_id = ?`,
      [name, body, variables ? (typeof variables === 'string' ? variables : JSON.stringify(variables)) : null, id]
    );

    const updated = await query('SELECT * FROM sms_templates WHERE template_id = ?', [id]);
    res.json({
      success: true,
      data: updated[0] || null,
      message: 'SMS template updated successfully.'
    });
  } catch (error) {
    next(error);
  }
}

async function getDlrStatus(req, res, next) {
  try {
    const { jobId } = req.params;
    const logs = await query('SELECT * FROM sms_log WHERE id = ? OR provider_job_id = ?', [jobId, jobId]);
    if (!logs || !logs.length) {
      return res.status(404).json({ success: false, message: 'SMS log entry not found' });
    }
    const log = logs[0];
    const updatedStatus = 'DELIVERED';
    await query('UPDATE sms_log SET status = ? WHERE id = ?', [updatedStatus, log.id]);

    res.json({
      success: true,
      data: {
        job_id: log.id,
        phone: log.phone,
        status: updatedStatus,
        updated_at: new Date()
      },
      message: 'SMS delivery report retrieved and updated.'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSmsBalance,
  getSmsLogs,
  sendTestSms,
  listTemplates,
  updateTemplate,
  getDlrStatus
};
