const db = require('../../config/db');
const fs = require('fs');
const path = require('path');

class SeoController {
  /**
   * POST /admin/seo/generate-sitemap
   */
  async generateSitemap(req, res, next) {
    try {
      const settings = await db.query(
        `SELECT setting_value FROM settings WHERE setting_key = 'store_url'`
      );
      const baseUrl = (settings && settings.length > 0 && settings[0].setting_value) 
        ? settings[0].setting_value.replace(/\/$/, '') 
        : `${req.protocol}://${req.get('host')}`;

      // Fetch active products
      const products = await db.query(
        `SELECT slug, updated_at FROM products WHERE is_active = 1 AND deleted_at IS NULL`
      );

      // Fetch active categories
      const categories = await db.query(
        `SELECT slug, updated_at FROM categories WHERE is_active = 1`
      );

      // Static pages
      const staticPages = [
        { url: '/', priority: '1.0', changefreq: 'daily' },
        { url: '/products', priority: '0.9', changefreq: 'daily' },
        { url: '/categories', priority: '0.8', changefreq: 'weekly' },
        { url: '/about', priority: '0.5', changefreq: 'monthly' },
        { url: '/contact', priority: '0.5', changefreq: 'monthly' }
      ];

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

      // Static pages XML
      for (const page of staticPages) {
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}${page.url}</loc>\n`;
        xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
        xml += `    <priority>${page.priority}</priority>\n`;
        xml += `  </url>\n`;
      }

      // Categories XML
      for (const cat of (categories || [])) {
        const lastmod = cat.updated_at ? new Date(cat.updated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/categories/${cat.slug}</loc>\n`;
        xml += `    <lastmod>${lastmod}</lastmod>\n`;
        xml += `    <changefreq>weekly</changefreq>\n`;
        xml += `    <priority>0.7</priority>\n`;
        xml += `  </url>\n`;
      }

      // Products XML
      for (const prod of (products || [])) {
        const lastmod = prod.updated_at ? new Date(prod.updated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        xml += `  <url>\n`;
        xml += `    <loc>${baseUrl}/products/${prod.slug}</loc>\n`;
        xml += `    <lastmod>${lastmod}</lastmod>\n`;
        xml += `    <changefreq>daily</changefreq>\n`;
        xml += `    <priority>0.8</priority>\n`;
        xml += `  </url>\n`;
      }

      xml += `</urlset>`;

      // Save to public directory if exists or create
      const publicDir = path.join(__dirname, '../../../public');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), xml, 'utf8');

      res.type('application/xml').send(xml);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /seo/pages/:key
   */
  async getPageSeo(req, res, next) {
    try {
      const pageKey = req.params.key;
      const pages = await db.query('SELECT * FROM seo_pages WHERE page_key = ?', [pageKey]);

      if (!pages || pages.length === 0) {
        return res.json({
          success: true,
          data: {
            page_key: pageKey,
            title: `WePrixe - ${pageKey.toUpperCase()}`,
            description: 'Default store page metadata',
            og_image: null
          },
          message: 'Default page SEO metadata returned.'
        });
      }

      res.json({
        success: true,
        data: pages[0],
        message: 'Page SEO metadata retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/seo/pages/:key
   */
  async updatePageSeo(req, res, next) {
    try {
      const pageKey = req.params.key;
      const { title, description, og_image } = req.body;

      await db.query(
        `INSERT INTO seo_pages (page_key, title, description, og_image)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), og_image = VALUES(og_image)`,
        [pageKey, title || null, description || null, og_image || null]
      );

      const pages = await db.query('SELECT * FROM seo_pages WHERE page_key = ?', [pageKey]);

      res.json({
        success: true,
        data: pages[0],
        message: 'Page SEO metadata updated.'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SeoController();
