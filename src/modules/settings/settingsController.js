const { query } = require('../../config/db');

const DEFAULT_FOOTER_SETTINGS = {
  brand: {
    logo_url: '',
    logo_text: 'ToyWorld',
    about_text: 'Bringing joy to kids of all ages with premium toys, next-level RC cars, and educational games. Playtime never stops!',
    show_brand_column: true
  },
  column_count: 4,
  columns: [
    {
      id: 'col-shop',
      heading: 'Shop',
      type: 'links',
      custom_content: '',
      links: [
        { id: 'l-1', label: 'All Products', url: '/products', target: '_self', highlight: false },
        { id: 'l-2', label: 'RC Cars & Trucks', url: '/categories/rc-cars', target: '_self', highlight: false },
        { id: 'l-3', label: 'Action Figures', url: '/categories/action-figures', target: '_self', highlight: false },
        { id: 'l-4', label: 'Puzzles & Games', url: '/categories/puzzles', target: '_self', highlight: false },
        { id: 'l-5', label: 'Educational Toys', url: '/categories/educational', target: '_self', highlight: false },
        { id: 'l-6', label: 'Baby & Toddler', url: '/categories/toddler', target: '_self', highlight: false },
        { id: 'l-7', label: 'Apply as Reseller', url: '/account/apply-reseller', target: '_self', highlight: true }
      ]
    },
    {
      id: 'col-care',
      heading: 'Customer Care',
      type: 'links',
      custom_content: '',
      links: [
        { id: 'l-8', label: 'Track Your Order', url: '/account/orders', target: '_self', highlight: false },
        { id: 'l-9', label: 'Shipping & Returns', url: '/shipping-returns', target: '_self', highlight: false },
        { id: 'l-10', label: 'FAQ', url: '/faq', target: '_self', highlight: false },
        { id: 'l-11', label: 'Contact Us', url: '/contact', target: '_self', highlight: false }
      ]
    },
    {
      id: 'col-contact',
      heading: 'Contact Us',
      type: 'custom',
      custom_content: 'Email: hello@toyworld.com\nPhone: +1 (800) TOY-WORLD\nAddress: 123 Playtime Avenue, Fun City, TX 75001',
      links: []
    }
  ],
  social_media: {
    enabled: true,
    title: 'Follow Us',
    links: [
      { id: 'soc-fb', platform: 'facebook', url: '#', enabled: true },
      { id: 'soc-tw', platform: 'twitter', url: '#', enabled: true },
      { id: 'soc-ig', platform: 'instagram', url: '#', enabled: true },
      { id: 'soc-yt', platform: 'youtube', url: '#', enabled: true }
    ]
  },
  bottom_bar: {
    enabled: true,
    copyright_text: '© {year} ToyWorld Inc. All rights reserved.',
    links: [
      { id: 'bot-1', label: 'Privacy Policy', url: '/privacy', target: '_self' },
      { id: 'bot-2', label: 'Terms of Service', url: '/terms', target: '_self' }
    ]
  }
};

const DEFAULT_HEADER_SETTINGS = {
  logo_url: '',
  logo_text: 'ToyWorld',
  logo_tagline: 'DISCOVER • PLAY • LEARN',
  show_tagline: true,
  announcement_bar: {
    enabled: true,
    shipping_text: 'Free Shipping on Orders Above ₹999',
    discount_text: 'Get 10% OFF on First Order | Use Code: TOY10',
    returns_text: 'Easy Returns | 100% Original Products'
  }
};

async function getPublicSettings(req, res, next) {
  try {
    const settings = await query("SELECT setting_key, setting_value FROM settings WHERE setting_group IN ('general', 'payment', 'shipping', 'search', 'footer')");
    const formatted = {};
    settings.forEach((s) => {
      formatted[s.setting_key] = s.setting_value;
    });
    res.json({ success: true, data: { settings: formatted } });
  } catch (error) {
    next(error);
  }
}

async function getHeaderSettings(req, res, next) {
  try {
    const rows = await query("SELECT setting_value FROM settings WHERE setting_key = 'header_settings' LIMIT 1");
    if (rows && rows.length > 0 && rows[0].setting_value) {
      try {
        const parsed = JSON.parse(rows[0].setting_value);
        return res.json({ success: true, data: parsed });
      } catch (e) {
        console.error('Failed to parse header_settings JSON:', e);
      }
    }
    return res.json({ success: true, data: DEFAULT_HEADER_SETTINGS });
  } catch (error) {
    next(error);
  }
}

async function updateHeaderSettings(req, res, next) {
  try {
    const headerData = req.body;
    if (!headerData || typeof headerData !== 'object') {
      return res.status(400).json({ success: false, message: 'Valid header configuration object required' });
    }

    const jsonStr = JSON.stringify(headerData);
    await query(
      `INSERT INTO settings (setting_key, setting_value, setting_group, description)
       VALUES ('header_settings', ?, 'general', 'Storefront dynamic header and logo configuration')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_group = 'general'`,
      [jsonStr]
    );

    try {
      const redisClient = require('../../config/redis');
      if (redisClient && redisClient.status === 'ready') {
        await redisClient.del('settings:header');
      }
    } catch (_) {}

    res.json({ success: true, message: 'Header configuration saved successfully', data: headerData });
  } catch (error) {
    next(error);
  }
}

async function getFooterSettings(req, res, next) {
  try {
    const rows = await query("SELECT setting_value FROM settings WHERE setting_key = 'footer_settings' LIMIT 1");
    if (rows && rows.length > 0 && rows[0].setting_value) {
      try {
        const parsed = JSON.parse(rows[0].setting_value);
        return res.json({ success: true, data: parsed });
      } catch (e) {
        console.error('Failed to parse footer_settings JSON:', e);
      }
    }
    return res.json({ success: true, data: DEFAULT_FOOTER_SETTINGS });
  } catch (error) {
    next(error);
  }
}

async function updateFooterSettings(req, res, next) {
  try {
    const footerData = req.body;
    if (!footerData || typeof footerData !== 'object') {
      return res.status(400).json({ success: false, message: 'Valid footer configuration object required' });
    }

    const jsonStr = JSON.stringify(footerData);
    await query(
      `INSERT INTO settings (setting_key, setting_value, setting_group, description)
       VALUES ('footer_settings', ?, 'footer', 'Storefront dynamic footer configuration')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_group = 'footer'`,
      [jsonStr]
    );

    // Try flushing redis cache if present
    try {
      const redisClient = require('../../config/redis');
      if (redisClient && redisClient.status === 'ready') {
        await redisClient.del('settings:footer');
      }
    } catch (_) {}

    res.json({ success: true, message: 'Footer configuration saved successfully', data: footerData });
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
        const group = item.setting_key.startsWith('footer_') ? 'footer' : 'shipping';
        await query(
          'INSERT INTO settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
          [item.setting_key, item.setting_value, group]
        );
      }
    } else if (typeof settings === 'object') {
      for (const [key, value] of Object.entries(settings)) {
        const group = key.startsWith('footer_') ? 'footer' : 'shipping';
        await query(
          'INSERT INTO settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
          [key, String(value), group]
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
  getHeaderSettings,
  updateHeaderSettings,
  getFooterSettings,
  updateFooterSettings,
  getAllSettings,
  bulkUpdateSettings,
  updateSingleSetting,
  flushCache,
  DEFAULT_HEADER_SETTINGS,
  DEFAULT_FOOTER_SETTINGS
};
