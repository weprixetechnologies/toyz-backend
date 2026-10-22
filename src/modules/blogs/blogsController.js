const { query } = require('../../config/db');

/**
 * GET /api/v1/blogs
 * Public listing of published blogs with filtering, search, and pagination.
 */
async function getBlogs(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 9));
    const offset = (page - 1) * limit;
    const { category, search, sort } = req.query;

    const conditions = ['is_published = 1'];
    const params = [];

    if (category && category !== 'all' && category !== 'All Posts') {
      conditions.push('(category_slug = ? OR category_name = ?)');
      params.push(category, category);
    }

    if (search && search.trim()) {
      conditions.push('(title LIKE ? OR excerpt LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Determine sort order
    let orderBy = 'published_at DESC, id DESC';
    if (sort === 'popular') {
      orderBy = 'views_count DESC, published_at DESC';
    } else if (sort === 'oldest') {
      orderBy = 'published_at ASC, id ASC';
    }

    // Total count query
    const countSql = `SELECT COUNT(*) as total FROM blogs ${whereClause}`;
    const [countRow] = await query(countSql, params);
    const total = countRow ? countRow.total : 0;
    const totalPages = Math.ceil(total / limit) || 1;

    // Fetch paginated blogs
    const selectSql = `
      SELECT id, title, slug, excerpt, featured_image, category_name, category_slug,
             author_name, reading_time, views_count, published_at, created_at
      FROM blogs
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;
    const blogs = await query(selectSql, [...params, limit, offset]);

    // Fetch category breakdown with article counts
    const categoriesSql = `
      SELECT c.id, c.name, c.slug, c.icon,
             COUNT(b.id) AS article_count
      FROM blog_categories c
      LEFT JOIN blogs b ON (b.category_slug = c.slug AND b.is_published = 1)
      WHERE c.is_active = 1
      GROUP BY c.id, c.name, c.slug, c.icon, c.sort_order
      ORDER BY c.sort_order ASC, c.name ASC
    `;
    const categories = await query(categoriesSql);

    res.json({
      success: true,
      data: {
        blogs,
        total,
        page,
        limit,
        totalPages,
        categories
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/blogs/categories
 * Returns active categories with their article counts.
 */
async function getBlogCategories(req, res, next) {
  try {
    const categoriesSql = `
      SELECT c.id, c.name, c.slug, c.icon,
             COUNT(b.id) AS article_count
      FROM blog_categories c
      LEFT JOIN blogs b ON (b.category_slug = c.slug AND b.is_published = 1)
      WHERE c.is_active = 1
      GROUP BY c.id, c.name, c.slug, c.icon, c.sort_order
      ORDER BY c.sort_order ASC, c.name ASC
    `;
    const categories = await query(categoriesSql);
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/blogs/:slug
 * Retrieve a single published blog article with related posts and recommended products.
 */
async function getBlogBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    if (!slug) {
      return res.status(400).json({ success: false, message: 'Article slug is required' });
    }

    const rows = await query('SELECT * FROM blogs WHERE slug = ? AND is_published = 1 LIMIT 1', [slug]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    const blog = rows[0];

    // Atomically increment views count
    query('UPDATE blogs SET views_count = views_count + 1 WHERE id = ?', [blog.id]).catch(() => { });

    // Fetch related blogs (same category first, excluding current article)
    const relatedSql = `
      SELECT id, title, slug, excerpt, featured_image, category_name, category_slug,
             reading_time, published_at
      FROM blogs
      WHERE is_published = 1 AND id != ?
      ORDER BY (category_slug = ?) DESC, published_at DESC
      LIMIT 4
    `;
    const relatedBlogs = await query(relatedSql, [blog.id, blog.category_slug]);

    // Fetch recommended products from the store database
    let recommendedProducts = [];
    try {
      // Find products related to article topic (e.g. RC Car, Monster Truck, toys)
      let searchKeyword = 'RC';
      if (blog.category_slug === 'rc-cars' || blog.title.toLowerCase().includes('rc')) {
        searchKeyword = 'RC';
      } else if (blog.category_slug === 'educational-toys') {
        searchKeyword = 'toy';
      }

      const prodSql = `
        SELECT p.id, p.name, p.slug, p.base_price, p.sale_price, p.stock_qty,
               (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) AS primary_image
        FROM products p
        WHERE p.is_active = 1 AND p.deleted_at IS NULL
          AND (p.name LIKE ? OR p.short_desc LIKE ?)
        ORDER BY p.is_featured DESC, p.id DESC
        LIMIT 3
      `;
      const term = `%${searchKeyword}%`;
      recommendedProducts = await query(prodSql, [term, term]);

      // Fallback to any active products if none matched
      if (!recommendedProducts || recommendedProducts.length === 0) {
        recommendedProducts = await query(`
          SELECT p.id, p.name, p.slug, p.base_price, p.sale_price, p.stock_qty,
                 (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id AND pi.is_primary = 1 LIMIT 1) AS primary_image
          FROM products p
          WHERE p.is_active = 1 AND p.deleted_at IS NULL
          ORDER BY p.id DESC
          LIMIT 3
        `);
      }
    } catch (_) { }

    res.json({
      success: true,
      data: {
        blog,
        relatedBlogs,
        recommendedProducts
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: GET /api/v1/blogs/admin/all
 */
async function getAllBlogsAdmin(req, res, next) {
  try {
    const blogs = await query('SELECT * FROM blogs ORDER BY id DESC');
    res.json({ success: true, data: blogs });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: POST /api/v1/blogs/admin
 */
async function createBlogAdmin(req, res, next) {
  try {
    const {
      title, slug, excerpt, content, featured_image, category_name, category_slug,
      author_name, reading_time, is_published, meta_title, meta_desc
    } = req.body;

    if (!title || !slug || !content) {
      return res.status(400).json({ success: false, message: 'Title, slug, and content are required' });
    }

    const result = await query(
      `INSERT INTO blogs (title, slug, excerpt, content, featured_image, category_name, category_slug, author_name, reading_time, is_published, meta_title, meta_desc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title, slug, excerpt || null, content, featured_image || null,
        category_name || 'General', category_slug || 'general',
        author_name || 'Provoke Playtech Team', reading_time || '5 min read',
        is_published ? 1 : 0, meta_title || null, meta_desc || null
      ]
    );

    res.status(201).json({ success: true, message: 'Blog post created', data: { id: result.insertId } });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: PUT /api/v1/blogs/admin/:id
 */
async function updateBlogAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const {
      title, slug, excerpt, content, featured_image, category_name, category_slug,
      author_name, reading_time, is_published, meta_title, meta_desc
    } = req.body;

    await query(
      `UPDATE blogs SET
         title = COALESCE(?, title),
         slug = COALESCE(?, slug),
         excerpt = COALESCE(?, excerpt),
         content = COALESCE(?, content),
         featured_image = COALESCE(?, featured_image),
         category_name = COALESCE(?, category_name),
         category_slug = COALESCE(?, category_slug),
         author_name = COALESCE(?, author_name),
         reading_time = COALESCE(?, reading_time),
         is_published = COALESCE(?, is_published),
         meta_title = COALESCE(?, meta_title),
         meta_desc = COALESCE(?, meta_desc)
       WHERE id = ?`,
      [
        title, slug, excerpt, content, featured_image, category_name, category_slug,
        author_name, reading_time, is_published !== undefined ? (is_published ? 1 : 0) : null,
        meta_title, meta_desc, id
      ]
    );

    res.json({ success: true, message: 'Blog post updated' });
  } catch (error) {
    next(error);
  }
}

/**
 * Admin: DELETE /api/v1/blogs/admin/:id
 */
async function deleteBlogAdmin(req, res, next) {
  try {
    const { id } = req.params;
    await query('DELETE FROM blogs WHERE id = ?', [id]);
    res.json({ success: true, message: 'Blog post deleted' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getBlogs,
  getBlogCategories,
  getBlogBySlug,
  getAllBlogsAdmin,
  createBlogAdmin,
  updateBlogAdmin,
  deleteBlogAdmin
};
