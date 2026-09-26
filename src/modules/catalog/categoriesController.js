const { query } = require('../../config/db');

async function listCategories(req, res, next) {
  try {
    const categories = await query('SELECT * FROM categories ORDER BY sort_order ASC, name ASC');

    // Build hierarchical tree
    const categoryMap = {};
    const tree = [];

    categories.forEach((cat) => {
      categoryMap[cat.id] = { ...cat, children: [] };
    });

    categories.forEach((cat) => {
      if (cat.parent_id && categoryMap[cat.parent_id]) {
        categoryMap[cat.parent_id].children.push(categoryMap[cat.id]);
      } else {
        tree.push(categoryMap[cat.id]);
      }
    });

    res.json({ success: true, data: { categories: tree, raw: categories } });
  } catch (error) {
    next(error);
  }
}

async function getCategoryBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const categories = await query('SELECT * FROM categories WHERE slug = ?', [slug]);
    if (categories.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, data: { category: categories[0] } });
  } catch (error) {
    next(error);
  }
}

async function createCategory(req, res, next) {
  try {
    const { parent_id, name, slug, description, image, banner_image, meta_title, meta_desc, sort_order, is_active } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ success: false, message: 'Name and slug are required' });
    }

    const result = await query(
      `INSERT INTO categories (parent_id, name, slug, description, image, banner_image, meta_title, meta_desc, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [parent_id || null, name, slug, description || null, image || null, banner_image || null, meta_title || null, meta_desc || null, sort_order || 0, is_active !== undefined ? is_active : 1]
    );

    res.status(201).json({ success: true, message: 'Category created', data: { id: result.insertId } });
  } catch (error) {
    next(error);
  }
}

async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const { parent_id, name, slug, description, image, banner_image, meta_title, meta_desc, sort_order, is_active } = req.body;

    await query(
      `UPDATE categories SET parent_id = COALESCE(?, parent_id), name = COALESCE(?, name), slug = COALESCE(?, slug), description = COALESCE(?, description), image = COALESCE(?, image), banner_image = COALESCE(?, banner_image), meta_title = COALESCE(?, meta_title), meta_desc = COALESCE(?, meta_desc), sort_order = COALESCE(?, sort_order), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [parent_id, name, slug, description, image, banner_image, meta_title, meta_desc, sort_order, is_active, id]
    );

    res.json({ success: true, message: 'Category updated successfully' });
  } catch (error) {
    next(error);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    await query('DELETE FROM categories WHERE id = ?', [id]);
    res.json({ success: true, message: 'Category deleted' });
  } catch (error) {
    next(error);
  }
}

async function reorderCategories(req, res, next) {
  try {
    const { items } = req.body; // Array of { id, sort_order }
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Items array is required' });
    }

    for (const item of items) {
      await query('UPDATE categories SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
    }

    res.json({ success: true, message: 'Categories reordered successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories
};
