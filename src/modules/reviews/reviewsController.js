const { query } = require('../../config/db');

async function listProductReviews(req, res, next) {
  try {
    const { id } = req.params;
    const reviews = await query(
      `SELECT pr.*, u.name as reviewer_name, u.avatar as reviewer_avatar
       FROM product_reviews pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.product_id = ? AND pr.status = 'approved'
       ORDER BY pr.id DESC`,
      [id]
    );

    res.json({ success: true, data: { reviews } });
  } catch (error) {
    next(error);
  }
}

async function submitReview(req, res, next) {
  try {
    const { id } = req.params;
    const { rating, title, body, images } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Valid rating between 1 and 5 is required' });
    }

    // Verified purchase check
    const orders = await query(
      `SELECT o.id FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE o.user_id = ? AND oi.product_id = ? AND o.status IN ('delivered', 'shipped', 'completed')
       LIMIT 1`,
      [req.user.id, id]
    );

    if (orders.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Only verified purchasers who have received this product can leave a review'
      });
    }

    const orderId = orders[0].id;

    // Check if review already exists for this order+product
    const existing = await query(
      'SELECT id FROM product_reviews WHERE user_id = ? AND product_id = ? AND order_id = ?',
      [req.user.id, id, orderId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this product for this order' });
    }

    const result = await query(
      `INSERT INTO product_reviews (product_id, user_id, order_id, rating, title, body, images, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, req.user.id, orderId, rating, title || null, body || null, images ? JSON.stringify(images) : null]
    );

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully and is pending admin approval',
      data: { review_id: result.insertId, status: 'pending' }
    });
  } catch (error) {
    next(error);
  }
}

// Admin Moderation Endpoints
async function listAllReviews(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClause = '';
    const params = [];
    if (status) {
      whereClause = 'WHERE pr.status = ?';
      params.push(status);
    }

    const [{ total }] = await query(`SELECT COUNT(*) as total FROM product_reviews pr ${whereClause}`, params);
    const reviews = await query(
      `SELECT pr.*, u.name as reviewer_name, p.name as product_name
       FROM product_reviews pr
       JOIN users u ON pr.user_id = u.id
       JOIN products p ON pr.product_id = p.id
       ${whereClause}
       ORDER BY pr.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    res.json({
      success: true,
      data: {
        reviews,
        pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), pages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getReviewById(req, res, next) {
  try {
    const { id } = req.params;
    const reviews = await query('SELECT * FROM product_reviews WHERE id = ?', [id]);
    if (reviews.length === 0) return res.status(404).json({ success: false, message: 'Review not found' });
    res.json({ success: true, data: { review: reviews[0] } });
  } catch (error) {
    next(error);
  }
}

async function approveReview(req, res, next) {
  try {
    const { id } = req.params;
    await query("UPDATE product_reviews SET status = 'approved' WHERE id = ?", [id]);
    res.json({ success: true, message: 'Review approved' });
  } catch (error) {
    next(error);
  }
}

async function rejectReview(req, res, next) {
  try {
    const { id } = req.params;
    const { note } = req.body;
    await query("UPDATE product_reviews SET status = 'rejected', admin_note = ? WHERE id = ?", [note || null, id]);
    res.json({ success: true, message: 'Review rejected' });
  } catch (error) {
    next(error);
  }
}

async function deleteReview(req, res, next) {
  try {
    const { id } = req.params;
    await query('DELETE FROM product_reviews WHERE id = ?', [id]);
    res.json({ success: true, message: 'Review deleted' });
  } catch (error) {
    next(error);
  }
}


async function listUserReviews(req, res, next) {
  try {
    const reviews = await query(
      `SELECT pr.*, p.name as product_name, p.slug as product_slug, 
        (SELECT url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) as product_image
       FROM product_reviews pr
       JOIN products p ON pr.product_id = p.id
       WHERE pr.user_id = ?
       ORDER BY pr.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: { reviews } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listUserReviews,
  listProductReviews,
  submitReview,
  listAllReviews,
  getReviewById,
  approveReview,
  rejectReview,
  deleteReview
};

async function getProductReviewStats(req, res, next) {
  try {
    const { id } = req.params;
    const rows = await query(
      `SELECT
         COUNT(*) as total,
         ROUND(AVG(rating), 1) as average,
         SUM(rating = 5) as five,
         SUM(rating = 4) as four,
         SUM(rating = 3) as three,
         SUM(rating = 2) as two,
         SUM(rating = 1) as one
       FROM product_reviews
       WHERE product_id = ? AND status = 'approved'`,
      [id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    next(error);
  }
}
module.exports.getProductReviewStats = getProductReviewStats;
