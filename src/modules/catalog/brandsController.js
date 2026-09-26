const { query } = require('../../config/db');

async function listBrands(req, res, next) {
  try {
    const brands = await query('SELECT * FROM brands ORDER BY name ASC');
    res.json({ success: true, data: { brands } });
  } catch (error) {
    next(error);
  }
}

async function createBrand(req, res, next) {
  try {
    const { name, slug, logo, is_active } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ success: false, message: 'Name and slug are required' });
    }

    const result = await query(
      'INSERT INTO brands (name, slug, logo, is_active) VALUES (?, ?, ?, ?)',
      [name, slug, logo || null, is_active !== undefined ? is_active : 1]
    );

    res.status(201).json({ success: true, message: 'Brand created', data: { id: result.insertId } });
  } catch (error) {
    next(error);
  }
}

async function updateBrand(req, res, next) {
  try {
    const { id } = req.params;
    const { name, slug, logo, is_active } = req.body;

    await query(
      'UPDATE brands SET name = COALESCE(?, name), slug = COALESCE(?, slug), logo = COALESCE(?, logo), is_active = COALESCE(?, is_active) WHERE id = ?',
      [name, slug, logo, is_active, id]
    );

    res.json({ success: true, message: 'Brand updated successfully' });
  } catch (error) {
    next(error);
  }
}

async function deleteBrand(req, res, next) {
  try {
    const { id } = req.params;
    await query('DELETE FROM brands WHERE id = ?', [id]);
    res.json({ success: true, message: 'Brand deleted' });
  } catch (error) {
    next(error);
  }
}

async function getBrandBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const brands = await query('SELECT * FROM brands WHERE slug = ?', [slug]);
    if (brands.length === 0) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }
    res.json({ success: true, data: { brand: brands[0] } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listBrands,
  getBrandBySlug,
  createBrand,
  updateBrand,
  deleteBrand
};
