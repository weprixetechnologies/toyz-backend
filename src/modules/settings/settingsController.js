const { query } = require('../../config/db');

async function getPublicSettings(req, res, next) {
  try {
    const settings = await query("SELECT setting_key, setting_value FROM settings WHERE setting_group IN ('general', 'payment', 'shipping')");
    const formatted = {};
    settings.forEach((s) => {
      formatted[s.setting_key] = s.setting_value;
    });
    res.json({ success: true, data: { settings: formatted } });
  } catch (error) {
    next(error);
  }
}

async function getAllSettings(req, res, next) {
  try {
    const settings = await query('SELECT * FROM settings ORDER BY setting_group ASC, setting_key ASC');
    res.json({ success: true, data: { settings } });
  } catch (error) {
    next(error);
  }
}

async function bulkUpdateSettings(req, res, next) {
  try {
    const { settings } = req.body; // Array of { setting_key, setting_value } or Object { key: value }
    if (!settings) {
      return res.status(400).json({ success: false, message: 'Settings payload is required' });
    }

    if (Array.isArray(settings)) {
      for (const item of settings) {
        await query(
          'INSERT INTO settings (setting_key, setting_value, setting_group) VALUES (?, ?, "shipping") ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
          [item.setting_key, item.setting_value]
        );
      }
    } else if (typeof settings === 'object') {
      for (const [key, value] of Object.entries(settings)) {
        await query(
          'INSERT INTO settings (setting_key, setting_value, setting_group) VALUES (?, ?, "shipping") ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
          [key, String(value)]
        );
      }
    }

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    next(error);
  }
}

async function updateSingleSetting(req, res, next) {
  try {
    const { key } = req.params;
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ success: false, message: 'Setting value required' });
    }

    await query('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [String(value), key]);
    res.json({ success: true, message: `Setting '${key}' updated` });
  } catch (error) {
    next(error);
  }
}

async function flushCache(req, res, next) {
  try {
    const redisClient = require('../../config/redis');
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.flushall();
    }
    res.json({
      success: true,
      message: 'Redis cache flushed successfully'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPublicSettings,
  getAllSettings,
  bulkUpdateSettings,
  updateSingleSetting,
  flushCache
};
