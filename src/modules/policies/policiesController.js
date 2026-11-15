const { query } = require('../../config/db');

// Slug generator helper
function generateSlug(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Common slug alias mapping for user friendly URLs
const SLUG_ALIASES = {
  'privacy': 'privacy-policy',
  'refund': 'refund-policy',
  'refunds': 'refund-policy',
  'returns': 'refund-policy',
  'return-policy': 'refund-policy',
  'terms': 'terms-and-conditions',
  'terms-of-service': 'terms-and-conditions',
  'tos': 'terms-and-conditions',
  'shipping': 'shipping-policy',
  'delivery': 'shipping-policy',
  'cookies': 'cookie-policy'
};

/**
 * Public: List all published policies
 */
exports.getPublicPolicies = async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, title, slug, type, summary, effective_date, updated_at
       FROM policies
       WHERE is_published = 1
       ORDER BY 
         CASE type 
           WHEN 'privacy' THEN 1
           WHEN 'refund' THEN 2
           WHEN 'terms' THEN 3
           WHEN 'shipping' THEN 4
           ELSE 5
         END, title ASC`
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Public: Get a single published policy by slug
 */
exports.getPublicPolicyBySlug = async (req, res, next) => {
  try {
    let { slug } = req.params;
    if (!slug) {
      return res.status(400).json({ success: false, message: 'Slug is required' });
    }

    slug = slug.toLowerCase().trim();
    const resolvedSlug = SLUG_ALIASES[slug] || slug;

    const rows = await query(
      `SELECT id, title, slug, type, content, summary, effective_date, meta_title, meta_description, version, updated_at
       FROM policies
       WHERE (slug = ? OR slug = ?) AND is_published = 1
       LIMIT 1`,
      [resolvedSlug, slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Policy document not found' });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Get all policies (including drafts)
 */
exports.getAllPoliciesAdmin = async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, title, slug, type, summary, effective_date, is_published, version, created_at, updated_at,
              CHAR_LENGTH(content) AS content_chars
       FROM policies
       ORDER BY updated_at DESC`
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Get single policy by ID
 */
exports.getPolicyByIdAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const rows = await query(
      `SELECT * FROM policies WHERE id = ? LIMIT 1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Create a new policy
 */
exports.createPolicyAdmin = async (req, res, next) => {
  try {
    const {
      title,
      slug: customSlug,
      type = 'custom',
      content,
      summary = '',
      effective_date = null,
      is_published = 1,
      meta_title = '',
      meta_description = '',
      version = '1.0'
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Policy content is required' });
    }

    let finalSlug = customSlug ? generateSlug(customSlug) : generateSlug(title);
    if (!finalSlug) {
      finalSlug = 'policy-' + Date.now();
    }

    // Check slug collision
    const existing = await query(`SELECT id FROM policies WHERE slug = ? LIMIT 1`, [finalSlug]);
    if (existing.length > 0) {
      finalSlug = `${finalSlug}-${Date.now().toString().slice(-4)}`;
    }

    const result = await query(
      `INSERT INTO policies 
       (title, slug, type, content, summary, effective_date, is_published, meta_title, meta_description, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title.trim(),
        finalSlug,
        type,
        content,
        summary?.trim() || null,
        effective_date || null,
        is_published ? 1 : 0,
        meta_title?.trim() || null,
        meta_description?.trim() || null,
        version?.trim() || '1.0'
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Policy created successfully',
      data: {
        id: result.insertId,
        slug: finalSlug
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Update existing policy
 */
exports.updatePolicyAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      slug: customSlug,
      type,
      content,
      summary,
      effective_date,
      is_published,
      meta_title,
      meta_description,
      version
    } = req.body;

    const existing = await query(`SELECT id, slug FROM policies WHERE id = ? LIMIT 1`, [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    let finalSlug = existing[0].slug;
    if (customSlug && customSlug.trim() !== existing[0].slug) {
      finalSlug = generateSlug(customSlug);
      const conflict = await query(`SELECT id FROM policies WHERE slug = ? AND id != ? LIMIT 1`, [finalSlug, id]);
      if (conflict.length > 0) {
        return res.status(400).json({ success: false, message: `The slug '${finalSlug}' is already in use by another policy.` });
      }
    }

    await query(
      `UPDATE policies SET
         title = COALESCE(?, title),
         slug = ?,
         type = COALESCE(?, type),
         content = COALESCE(?, content),
         summary = ?,
         effective_date = ?,
         is_published = COALESCE(?, is_published),
         meta_title = ?,
         meta_description = ?,
         version = COALESCE(?, version),
         updated_at = NOW()
       WHERE id = ?`,
      [
        title !== undefined ? title.trim() : null,
        finalSlug,
        type || null,
        content !== undefined ? content : null,
        summary !== undefined ? (summary?.trim() || null) : null,
        effective_date !== undefined ? (effective_date || null) : null,
        is_published !== undefined ? (is_published ? 1 : 0) : null,
        meta_title !== undefined ? (meta_title?.trim() || null) : null,
        meta_description !== undefined ? (meta_description?.trim() || null) : null,
        version !== undefined ? (version?.trim() || '1.0') : null,
        id
      ]
    );

    res.json({
      success: true,
      message: 'Policy updated successfully',
      data: {
        id,
        slug: finalSlug
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin: Delete policy
 */
exports.deletePolicyAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(`DELETE FROM policies WHERE id = ?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    res.json({
      success: true,
      message: 'Policy deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
