const { query } = require('../../config/db');

class SectionTagsController {
  
  async getAllTags(req, res, next) {
    try {
      const tags = await query(`SELECT * FROM section_tags ORDER BY id DESC`);
      
      const formatted = [];
      for (const tag of tags) {
        const products = await query(`
          SELECT p.id, p.name, (SELECT url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) AS primary_image, p.base_price, p.sale_price, p.sku
          FROM product_section_tags pt
          JOIN products p ON pt.product_id = p.id
          WHERE pt.tag_id = ? AND p.deleted_at IS NULL
        `, [tag.id]);
        formatted.push({ ...tag, products });
      }

      res.json({ success: true, data: formatted });
    } catch (err) {
      next(err);
    }
  }

  async createTag(req, res, next) {
    try {
      const { name, slug, description, is_active } = req.body;
      const result = await query(
        `INSERT INTO section_tags (name, slug, description, is_active) VALUES (?, ?, ?, ?)`,
        [name, slug, description || null, is_active === undefined ? 1 : is_active]
      );
      res.json({ success: true, data: { id: result.insertId } });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ success: false, message: 'Tag slug already exists' });
      }
      next(err);
    }
  }

  async updateTag(req, res, next) {
    try {
      const { id } = req.params;
      const { name, slug, description, is_active } = req.body;
      await query(
        `UPDATE section_tags SET name=?, slug=?, description=?, is_active=? WHERE id=?`,
        [name, slug, description || null, is_active === undefined ? 1 : is_active, id]
      );
      res.json({ success: true });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ success: false, message: 'Tag slug already exists' });
      }
      next(err);
    }
  }

  async deleteTag(req, res, next) {
    try {
      const { id } = req.params;
      await query(`DELETE FROM section_tags WHERE id=?`, [id]);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async addProducts(req, res, next) {
    try {
      const { id } = req.params;
      const { productIds } = req.body;
      if (Array.isArray(productIds)) {
        for (const prodId of productIds) {
          await query(`INSERT IGNORE INTO product_section_tags (tag_id, product_id) VALUES (?, ?)`, [id, prodId]);
        }
      }
      res.json({ success: true });
    } catch(err) {
      next(err);
    }
  }

  async removeProducts(req, res, next) {
    try {
      const { id } = req.params;
      const { productIds } = req.body; // array
      if (Array.isArray(productIds) && productIds.length > 0) {
        const placeholders = productIds.map(() => '?').join(',');
        await query(`DELETE FROM product_section_tags WHERE tag_id=? AND product_id IN (${placeholders})`, [id, ...productIds]);
      }
      res.json({ success: true });
    } catch(err) {
      next(err);
    }
  }
}

module.exports = new SectionTagsController();
