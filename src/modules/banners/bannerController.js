const { query } = require('../../config/db');

async function listBanners(req, res, next) {
  try {
    const { type, is_active } = req.query;
    let sql = 'SELECT * FROM banners WHERE 1=1';
    const params = [];
    
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    if (is_active !== undefined) {
      if (is_active !== 'all') {
        sql += ' AND is_active = ?';
        params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
      }
    } else {
      sql += ' AND is_active = 1';
    }
    
    sql += ' ORDER BY sort_order ASC, id DESC';
    
    const banners = await query(sql, params);
    res.json({ success: true, data: { banners } });
  } catch (error) {
    next(error);
  }
}

async function getBanner(req, res, next) {
  try {
    const { id } = req.params;
    const banners = await query('SELECT * FROM banners WHERE id = ?', [id]);
    if (banners.length === 0) {
      return res.status(404).json({ success: false, message: 'Banner not found' });
    }
    res.json({ success: true, data: banners[0] });
  } catch (error) {
    next(error);
  }
}

async function createBanner(req, res, next) {
  try {
    const { title, subtitle, image_url, link_url, button_text, type = 'hero', sort_order = 0, is_active = 1 } = req.body;
    
    if (!image_url) {
      return res.status(400).json({ success: false, message: 'image_url is required' });
    }

    const result = await query(
      'INSERT INTO banners (title, subtitle, image_url, link_url, button_text, type, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [title, subtitle, image_url, link_url, button_text, type, sort_order, is_active]
    );

    res.status(201).json({ success: true, message: 'Banner created', data: { id: result.insertId } });
  } catch (error) {
    next(error);
  }
}

async function updateBanner(req, res, next) {
  try {
    const { id } = req.params;
    const { title, subtitle, image_url, link_url, button_text, type, sort_order, is_active } = req.body;
    
    const updates = [];
    const params = [];
    
    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (subtitle !== undefined) { updates.push('subtitle = ?'); params.push(subtitle); }
    if (image_url !== undefined) { updates.push('image_url = ?'); params.push(image_url); }
    if (link_url !== undefined) { updates.push('link_url = ?'); params.push(link_url); }
    if (button_text !== undefined) { updates.push('button_text = ?'); params.push(button_text); }
    if (type !== undefined) { updates.push('type = ?'); params.push(type); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
    
    if (updates.length === 0) {
      return res.json({ success: true, message: 'No changes provided' });
    }
    
    params.push(id);
    await query(`UPDATE banners SET ${updates.join(', ')} WHERE id = ?`, params);
    
    res.json({ success: true, message: 'Banner updated' });
  } catch (error) {
    next(error);
  }
}

async function deleteBanner(req, res, next) {
  try {
    const { id } = req.params;
    await query('DELETE FROM banners WHERE id = ?', [id]);
    res.json({ success: true, message: 'Banner deleted' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listBanners,
  getBanner,
  createBanner,
  updateBanner,
  deleteBanner
};
