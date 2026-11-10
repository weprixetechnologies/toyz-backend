const { query } = require('../../config/db');

const DEFAULT_FOOTER_SETTINGS = {
  brand: {
    logo_url: '',
    logo_text: 'Provoke Playtech',
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
      custom_content: 'Email: hello@Provoke Playtech.com\nPhone: +1 (800) TOY-WORLD\nAddress: 123 Playtime Avenue, Fun City, TX 75001',
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
    copyright_text: '© {year} Provoke Playtech Inc. All rights reserved.',
    links: [
      { id: 'bot-1', label: 'Privacy Policy', url: '/privacy', target: '_self' },
      { id: 'bot-2', label: 'Terms of Service', url: '/terms', target: '_self' }
    ]
  }
};

const DEFAULT_HEADER_SETTINGS = {
  logo_url: '',
  logo_text: '',
  logo_tagline: '',
  logo_width: 200,
  logo_width_mobile: 150,
  show_tagline: false,
  announcement_bar: {
    enabled: true,
    shipping_text: 'Free Shipping on Orders Above ₹999',
    discount_text: 'Get 10% OFF on First Order | Use Code: TOY10',
    returns_text: 'Easy Returns | 100% Original Products'
  }
};

const DEFAULT_STORE_BRAND_SETTINGS = {
  store_name: 'Provoke Playtech',
  store_tagline: 'Premium Toys & Next-Gen Gadgets',
  logo_url: '',
  gstin: '27AABCU9603R1ZM',
  email: 'support@provokeplaytech.com',
  phone: '+91 98765 43210',
  address_line1: '123 Playtech Avenue',
  address_line2: 'Industrial Area, Phase 2',
  city: 'Mumbai',
  state: 'Maharashtra',
  pin_code: '400001',
  country: 'India',
  invoice_footer: 'Thank you for choosing Provoke Playtech! For support or returns, visit provokeplaytech.com or email support@provokeplaytech.com. This is a computer generated tax invoice.'
};

const STORE_BRAND_REDIS_KEY = 'settings:store_brand';
const STORE_BRAND_CACHE_TTL = 86400; // 24 hours

async function getStoreBrandConfig() {
  try {
    const redisClient = require('../../config/redis');
    if (redisClient && redisClient.status === 'ready') {
      const cached = await redisClient.get(STORE_BRAND_REDIS_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    }
  } catch (err) {
    console.warn('[Redis] Store brand cache read error:', err.message);
  }

  try {
    const rows = await query("SELECT setting_value FROM settings WHERE setting_key = 'store_brand_settings' LIMIT 1");
    let config = { ...DEFAULT_STORE_BRAND_SETTINGS };
    if (rows && rows.length > 0 && rows[0].setting_value) {
      try {
        const parsed = JSON.parse(rows[0].setting_value);
        config = { ...config, ...parsed };
      } catch (e) {
        console.error('Failed to parse store_brand_settings JSON:', e);
      }
    }

    try {
      const redisClient = require('../../config/redis');
      if (redisClient && redisClient.status === 'ready') {
        await redisClient.setex(STORE_BRAND_REDIS_KEY, STORE_BRAND_CACHE_TTL, JSON.stringify(config));
      }
    } catch (_) {}

    return config;
  } catch (e) {
    console.error('[getStoreBrandConfig] Database read error:', e.message);
    return DEFAULT_STORE_BRAND_SETTINGS;
  }
}

async function getStoreBrandSettings(req, res, next) {
  try {
    const config = await getStoreBrandConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
}

async function updateStoreBrandSettings(req, res, next) {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ success: false, message: 'Valid settings object required' });
    }

    const current = await getStoreBrandConfig();
    const updated = {
      store_name: String(data.store_name ?? current.store_name ?? '').trim() || DEFAULT_STORE_BRAND_SETTINGS.store_name,
      store_tagline: String(data.store_tagline ?? current.store_tagline ?? '').trim(),
      logo_url: String(data.logo_url ?? current.logo_url ?? '').trim(),
      gstin: String(data.gstin ?? current.gstin ?? '').trim(),
      email: String(data.email ?? current.email ?? '').trim(),
      phone: String(data.phone ?? current.phone ?? '').trim(),
      address_line1: String(data.address_line1 ?? current.address_line1 ?? '').trim(),
      address_line2: String(data.address_line2 ?? current.address_line2 ?? '').trim(),
      city: String(data.city ?? current.city ?? '').trim(),
      state: String(data.state ?? current.state ?? '').trim(),
      pin_code: String(data.pin_code ?? current.pin_code ?? '').trim(),
      country: String(data.country ?? current.country ?? '').trim() || 'India',
      invoice_footer: String(data.invoice_footer ?? current.invoice_footer ?? '').trim()
    };

    const jsonStr = JSON.stringify(updated);
    await query(
      `INSERT INTO settings (setting_key, setting_value, setting_group, description)
       VALUES ('store_brand_settings', ?, 'general', 'Brand details, GSTIN, and Invoice footer configurations')
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_group = 'general'`,
      [jsonStr]
    );

    // Warm / Update Redis cache immediately
    try {
      const redisClient = require('../../config/redis');
      if (redisClient && redisClient.status === 'ready') {
        await redisClient.setex(STORE_BRAND_REDIS_KEY, STORE_BRAND_CACHE_TTL, jsonStr);
      }
    } catch (redisErr) {
      console.warn('[Redis] Store brand cache update error:', redisErr.message);
    }

    res.json({
      success: true,
      message: 'Store brand & invoice settings updated successfully',
      data: updated
    });
  } catch (error) {
    next(error);
  }
}

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
    } catch (_) { }

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
    } catch (_) { }

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
  getStoreBrandConfig,
  getStoreBrandSettings,
  updateStoreBrandSettings,
  DEFAULT_HEADER_SETTINGS,
  DEFAULT_FOOTER_SETTINGS,
  DEFAULT_STORE_BRAND_SETTINGS
};
