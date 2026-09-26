const { query } = require('../config/db');
const smsConfig = require('../config/sms');

async function sendSms({ phone, templateId, variables }) {
  try {
    if (!phone) return { success: false, error: 'Phone number required' };

    const templates = await query('SELECT * FROM sms_templates WHERE template_id = ? AND is_active = 1', [templateId]);
    if (!templates || templates.length === 0) {
      console.warn(`[SMS Service] Template '${templateId}' not found or inactive`);
      return { success: false, error: `Template '${templateId}' not found` };
    }

    let body = templates[0].body;
    if (variables && typeof variables === 'object') {
      Object.keys(variables).forEach((key) => {
        body = body.replace(new RegExp(`{{${key}}}`, 'g'), variables[key]);
      });
    }

    console.log(`[SMS Sent Simulation] To: ${phone} | Template: ${templateId} | Body: ${body}`);

    const result = await query(
      `INSERT INTO sms_log (phone, template_id, message_body, provider_job_id, status)
       VALUES (?, ?, ?, ?, 'sent')`,
      [phone, templateId, body, `MOCK-JOB-${Date.now()}`]
    );

    return { success: true, logId: result.insertId, body };
  } catch (error) {
    console.error('[SMS Service Error]:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendSms
};
