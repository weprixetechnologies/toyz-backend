const { query } = require('../../config/db');

const DEFAULT_WIDGETS_CONFIG = {
  contact_form: {
    enabled: true,
    title: 'Quick Inquiry / Contact Us',
    subtitle: 'Leave your contact details and requirement. Our team will get back to you shortly.',
    button_tooltip: 'Quick Contact',
    shake_interval_seconds: 6,
    button_color: '#0284c7'
  },
  chatbot: {
    enabled: true,
    bot_name: 'Provoke Playtech Assistant',
    bot_subtitle: 'Online • Quick Answers',
    welcome_message: 'Hi there! 👋 Welcome to Provoke Playtech. How can we help you today? Please choose an option below:',
    button_tooltip: 'Chat with Us',
    button_color: '#4f46e5',
    flow: [
      {
        id: 'root',
        title: 'Main Menu',
        options: [
          {
            id: 'opt_track',
            label: '📦 Track My Order',
            action_type: 'link',
            url: '/account/orders',
            response_message: 'You can view real-time shipping status and track your parcel directly in your orders dashboard.'
          },
          {
            id: 'opt_wholesale',
            label: '💼 Wholesale & Bulk Orders',
            action_type: 'message',
            response_message: 'We offer specialized wholesale pricing, MOQ tiered discounts, and verified retailer accounts! How would you like to proceed?',
            next_options: [
              {
                id: 'opt_apply_reseller',
                label: '📝 Apply for Reseller Account',
                action_type: 'link',
                url: '/account/apply-reseller',
                response_message: 'Redirecting you to our Reseller Onboarding form where you can register with your GSTIN.'
              },
              {
                id: 'opt_lead_bulk',
                label: '💬 Submit Bulk Inquiry',
                action_type: 'lead_form',
                response_message: 'Opening our quick lead form. Please enter your required quantity and product names!'
              }
            ]
          },
          {
            id: 'opt_offers',
            label: '🎁 Ongoing Offers & Discounts',
            action_type: 'link',
            url: '/offers',
            response_message: 'Check out our live promotions, voucher codes, and clearance sales!'
          },
          {
            id: 'opt_categories',
            label: '🧸 Browse Toy Categories',
            action_type: 'message',
            response_message: 'Explore our wide range of toys, RC vehicles, action figures, puzzles, and educational games:',
            next_options: [
              {
                id: 'opt_all_products',
                label: '🛒 All Products',
                action_type: 'link',
                url: '/products',
                response_message: 'Explore our full catalog.'
              },
              {
                id: 'opt_rc_cars',
                label: '🏎️ RC Cars & Trucks',
                action_type: 'link',
                url: '/categories/rc-cars',
                response_message: 'Check out our top remote-control models.'
              },
              {
                id: 'opt_blocks',
                label: '🧱 Building Blocks',
                action_type: 'link',
                url: '/categories/building-blocks',
                response_message: 'Explore our creative building blocks collection.'
              }
            ]
          },
          {
            id: 'opt_talk_rep',
            label: '📞 Contact Support Team',
            action_type: 'lead_form',
            response_message: 'Please leave your contact number and query below, and our support team will reach out promptly!'
          }
        ]
      }
    ]
  }
};

const REDIS_CACHE_KEY = 'settings:floating_widgets';
const CACHE_TTL_SECONDS = 86400; // 24 hours (invalidated immediately on admin update)

/**
 * Public endpoint: GET /api/v1/floating-widgets/config
 * Highly optimized, Redis-backed for sub-millisecond response time.
 */
async function getPublicConfig(req, res, next) {
  try {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');

    // 1. Check Redis cache first (sub-millisecond retrieval)
    try {
      const redisClient = require('../../config/redis');
      if (redisClient && redisClient.status === 'ready') {
        const cached = await redisClient.get(REDIS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          res.setHeader('X-Cache', 'HIT-REDIS');
          return res.json({ success: true, data: parsed });
        }
      }
    } catch (redisErr) {
      console.warn('[Redis] Cache read error for floating widgets:', redisErr.message);
    }

    // 2. Fetch from MySQL on cache miss or Redis offline
    const rows = await query(
      "SELECT setting_value FROM settings WHERE setting_key = 'floating_widgets_config' LIMIT 1"
    );

    let configData = DEFAULT_WIDGETS_CONFIG;
    if (rows && rows.length > 0 && rows[0].setting_value) {
      try {
        configData = JSON.parse(rows[0].setting_value);
      } catch (err) {
        console.error('Failed to parse floating_widgets_config JSON:', err);
      }
    }

    // 3. Warm Redis cache for subsequent calls
    try {
      const redisClient = require('../../config/redis');
      if (redisClient && redisClient.status === 'ready') {
        await redisClient.setex(REDIS_CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(configData));
      }
    } catch (redisErr) {
      console.warn('[Redis] Cache write error for floating widgets:', redisErr.message);
    }

    res.setHeader('X-Cache', 'MISS');
    return res.json({ success: true, data: configData });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin endpoint: GET /api/v1/floating-widgets/admin/config
 */
async function getAdminConfig(req, res, next) {
  try {
    // Check Redis first
    try {
      const redisClient = require('../../config/redis');
      if (redisClient && redisClient.status === 'ready') {
        const cached = await redisClient.get(REDIS_CACHE_KEY);
        if (cached) {
          return res.json({ success: true, data: JSON.parse(cached) });
        }
      }
    } catch (_) {}

    const rows = await query(
      "SELECT setting_value FROM settings WHERE setting_key = 'floating_widgets_config' LIMIT 1"
    );

    if (rows && rows.length > 0 && rows[0].setting_value) {
      try {
        const parsed = JSON.parse(rows[0].setting_value);
        return res.json({ success: true, data: parsed });
      } catch (err) {
        console.error('Failed to parse floating_widgets_config JSON:', err);
      }
    }

    return res.json({ success: true, data: DEFAULT_WIDGETS_CONFIG });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin endpoint: PUT /api/v1/floating-widgets/admin/config
 */
async function updateAdminConfig(req, res, next) {
  try {
    const configData = req.body;
    if (!configData || typeof configData !== 'object') {
      return res.status(400).json({ success: false, message: 'Valid configuration object required' });
    }

    // Merge or validate basic fields
    const sanitizedConfig = {
      contact_form: {
        enabled: Boolean(configData.contact_form?.enabled),
        title: String(configData.contact_form?.title || DEFAULT_WIDGETS_CONFIG.contact_form.title),
        subtitle: String(configData.contact_form?.subtitle || DEFAULT_WIDGETS_CONFIG.contact_form.subtitle),
        button_tooltip: String(configData.contact_form?.button_tooltip || DEFAULT_WIDGETS_CONFIG.contact_form.button_tooltip),
        shake_interval_seconds: Number(configData.contact_form?.shake_interval_seconds) || 6,
        button_color: String(configData.contact_form?.button_color || '#0284c7')
      },
      chatbot: {
        enabled: Boolean(configData.chatbot?.enabled),
        bot_name: String(configData.chatbot?.bot_name || DEFAULT_WIDGETS_CONFIG.chatbot.bot_name),
        bot_subtitle: String(configData.chatbot?.bot_subtitle || DEFAULT_WIDGETS_CONFIG.chatbot.bot_subtitle),
        welcome_message: String(configData.chatbot?.welcome_message || DEFAULT_WIDGETS_CONFIG.chatbot.welcome_message),
        button_tooltip: String(configData.chatbot?.button_tooltip || DEFAULT_WIDGETS_CONFIG.chatbot.button_tooltip),
        button_color: String(configData.chatbot?.button_color || '#4f46e5'),
        flow: Array.isArray(configData.chatbot?.flow) ? configData.chatbot.flow : DEFAULT_WIDGETS_CONFIG.chatbot.flow
      }
    };

    const jsonStr = JSON.stringify(sanitizedConfig);

    await query(
      `INSERT INTO settings (setting_key, setting_value, setting_group, description)
       VALUES ('floating_widgets_config', ?, 'general', 'Floating widgets and conditional chatbot flow configuration')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_group = 'general'`,
      [jsonStr]
    );

    // Warm Redis cache with the updated configuration immediately
    try {
      const redisClient = require('../../config/redis');
      if (redisClient && redisClient.status === 'ready') {
        await redisClient.setex(REDIS_CACHE_KEY, CACHE_TTL_SECONDS, jsonStr);
      }
    } catch (redisErr) {
      console.warn('[Redis] Cache update error:', redisErr.message);
    }

    return res.json({
      success: true,
      message: 'Floating widgets configuration updated successfully',
      data: sanitizedConfig
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getPublicConfig,
  getAdminConfig,
  updateAdminConfig,
  DEFAULT_WIDGETS_CONFIG
};
