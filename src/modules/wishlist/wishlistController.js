const db = require('../../config/db');

class WishlistController {
  /**
   * GET /wishlist
   */
  async getWishlist(req, res, next) {
    try {
      const userId = req.user.id;
      const rows = await db.query(
        `SELECT w.id AS wishlist_id, w.product_id, w.variant_id, w.added_at, p.id, p.name, p.slug, p.base_price, p.sale_price, p.product_type,
                (SELECT url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) AS primary_image,
                pv.sku AS variant_sku, pv.price AS variant_price
         FROM wishlists w
         JOIN products p ON w.product_id = p.id
         LEFT JOIN product_variants pv ON w.variant_id = pv.id
         WHERE w.user_id = ?
         ORDER BY w.added_at DESC`,
        [userId]
      );

      res.json({
        success: true,
        data: rows || [],
        message: 'Wishlist items retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /wishlist
   */
  async addToWishlist(req, res, next) {
    try {
      const userId = req.user.id;
      const { product_id, variant_id } = req.body;

      if (!product_id) {
        return res.status(400).json({
          success: false,
          data: null,
          message: 'Product ID is required.'
        });
      }

      // Check product exists
      const products = await db.query('SELECT id FROM products WHERE id = ?', [product_id]);
      if (!products || products.length === 0) {
        return res.status(404).json({
          success: false,
          data: null,
          message: 'Product not found.'
        });
      }

      await db.query(
        `INSERT INTO wishlists (user_id, product_id, variant_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE variant_id = VALUES(variant_id), added_at = NOW()`,
        [userId, product_id, variant_id || null]
      );

      res.status(201).json({
        success: true,
        data: { user_id: userId, product_id, variant_id },
        message: 'Item added to wishlist.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /wishlist/:productId
   */
  async removeFromWishlist(req, res, next) {
    try {
      const userId = req.user.id;
      const productId = req.params.productId;

      await db.query(
        'DELETE FROM wishlists WHERE user_id = ? AND product_id = ?',
        [userId, productId]
      );

      res.json({
        success: true,
        data: { product_id: productId },
        message: 'Item removed from wishlist.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /wishlist/:productId/move-to-cart
   */
  async moveToCart(req, res, next) {
    try {
      const userId = req.user.id;
      const productId = req.params.productId;

      // Find item in wishlist
      const wishlistItems = await db.query(
        'SELECT * FROM wishlists WHERE user_id = ? AND product_id = ?',
        [userId, productId]
      );

      if (!wishlistItems || wishlistItems.length === 0) {
        return res.status(404).json({
          success: false,
          data: null,
          message: 'Item not found in wishlist.'
        });
      }

      const item = wishlistItems[0];

      // Get or create user cart
      let carts = await db.query('SELECT id FROM carts WHERE user_id = ?', [userId]);
      let cartId;
      if (!carts || carts.length === 0) {
        const cRes = await db.query('INSERT INTO carts (user_id) VALUES (?)', [userId]);
        cartId = cRes.insertId;
      } else {
        cartId = carts[0].id;
      }

      // Add to cart items
      await db.query(
        `INSERT INTO cart_items (cart_id, product_id, variant_id, qty)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE qty = qty + 1`,
        [cartId, item.product_id, item.variant_id || null]
      );

      // Remove from wishlist
      await db.query('DELETE FROM wishlists WHERE id = ?', [item.id]);

      res.json({
        success: true,
        data: { cart_id: cartId, product_id: productId },
        message: 'Item moved from wishlist to cart.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /products/recently-viewed
   */
  async getRecentlyViewed(req, res, next) {
    try {
      const userId = req.user.id;
      const rows = await db.query(
        `SELECT rv.*, p.name AS title, p.slug, p.base_price, 
                (SELECT url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) AS main_image
         FROM recently_viewed rv
         JOIN products p ON rv.product_id = p.id
         WHERE rv.user_id = ?
         ORDER BY rv.viewed_at DESC
         LIMIT 20`,
        [userId]
      );

      res.json({
        success: true,
        data: rows || [],
        message: 'Recently viewed products retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /products/:id/viewed
   */
  async recordView(req, res, next) {
    try {
      const userId = req.user.id;
      const productId = req.params.id;

      await db.query(
        `INSERT INTO recently_viewed (user_id, product_id, viewed_at)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE viewed_at = NOW()`,
        [userId, productId]
      );

      res.json({
        success: true,
        data: { user_id: userId, product_id: productId },
        message: 'Product view recorded.'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WishlistController();
