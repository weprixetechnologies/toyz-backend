const { query } = require('../../config/db');

class HomepageController {
  
  // PUBLIC
  async getHomepageData(req, res, next) {
    try {
      const sections = await query(
        `SELECT * FROM homepage_sections WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`
      );
      
      const formattedSections = [];

      for (const sec of sections) {
        const baseSec = {
          ...sec,
          config_data: typeof sec.config_data === 'string' ? JSON.parse(sec.config_data) : sec.config_data
        };

        if (sec.type === 'product_section') {
          // Fetch products via the assigned tag in config_data
          let products = [];
          if (baseSec.config_data && baseSec.config_data.tag_id) {
            products = await query(
              `SELECT p.id, p.name, p.slug, p.base_price, p.sale_price, p.product_type, 
                      (SELECT url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) AS primary_image, (SELECT ROUND(AVG(rating),1) FROM product_reviews WHERE product_id = p.id AND status = 'approved') as avg_rating, (SELECT COUNT(*) FROM product_reviews WHERE product_id = p.id AND status = 'approved') as review_count
               FROM product_section_tags pt
               JOIN products p ON pt.product_id = p.id
               WHERE pt.tag_id = ? AND p.is_active = 1 AND p.deleted_at IS NULL
               ORDER BY p.id DESC`,
               [baseSec.config_data.tag_id]
            );
          }
          baseSec.products = products;
        }

        formattedSections.push(baseSec);
      }

      res.json({ success: true, data: formattedSections });
    } catch (err) {
      next(err);
    }
  }

  // ADMIN
  async getAllSections(req, res, next) {
    try {
      const sections = await query(`SELECT * FROM homepage_sections ORDER BY sort_order ASC, id ASC`);
      
      const formattedSections = [];
      for (const sec of sections) {
        const baseSec = {
          ...sec,
          config_data: typeof sec.config_data === 'string' ? JSON.parse(sec.config_data) : sec.config_data
        };
        
        if (sec.type === 'product_section') {
          let products = [];
          if (baseSec.config_data && baseSec.config_data.tag_id) {
            products = await query(
              `SELECT p.id, p.name, (SELECT url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) AS primary_image
               FROM product_section_tags pt
               JOIN products p ON pt.product_id = p.id
               WHERE pt.tag_id = ? AND p.deleted_at IS NULL
               ORDER BY p.id DESC`,
               [baseSec.config_data.tag_id]
            );
            
            // Fetch tag info
            const tagInfo = await query(`SELECT name FROM section_tags WHERE id = ?`, [baseSec.config_data.tag_id]);
            if (tagInfo.length > 0) baseSec.tag_name = tagInfo[0].name;
          }
          baseSec.products = products;
        }
        
        formattedSections.push(baseSec);
      }

      res.json({ success: true, data: formattedSections });
    } catch (err) {
      next(err);
    }
  }

  async createSection(req, res, next) {
    try {
      const { type, title, subtitle, layout_style, config_data, sort_order, is_active, products } = req.body;
      const configJson = config_data ? JSON.stringify(config_data) : null;
      
      const result = await query(
        `INSERT INTO homepage_sections (type, title, subtitle, layout_style, config_data, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [type, title || null, subtitle || null, layout_style || null, configJson, sort_order || 0, is_active === undefined ? 1 : is_active]
      );
      
      const sectionId = result.insertId;

      // No more homepage_section_products. Tag association is saved in configJson.
      
      res.json({ success: true, data: { id: sectionId } });
    } catch (err) {
      next(err);
    }
  }

  async updateSection(req, res, next) {
    try {
      const { id } = req.params;
      const { type, title, subtitle, layout_style, config_data, sort_order, is_active, products } = req.body;
      const configJson = config_data ? JSON.stringify(config_data) : null;
      
      await query(
        `UPDATE homepage_sections SET type=?, title=?, subtitle=?, layout_style=?, config_data=?, sort_order=?, is_active=? WHERE id=?`,
        [type, title || null, subtitle || null, layout_style || null, configJson, sort_order || 0, is_active === undefined ? 1 : is_active, id]
      );
      
      // No more homepage_section_products.
      
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async deleteSection(req, res, next) {
    try {
      const { id } = req.params;
      await query(`DELETE FROM homepage_sections WHERE id=?`, [id]);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async reorderSections(req, res, next) {
    try {
      const { updates } = req.body;
      if (Array.isArray(updates)) {
        for (const u of updates) {
          await query(`UPDATE homepage_sections SET sort_order=? WHERE id=?`, [u.sort_order, u.id]);
        }
      }
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

}

module.exports = new HomepageController();
