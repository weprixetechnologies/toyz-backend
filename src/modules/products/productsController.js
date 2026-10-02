const { query } = require('../../config/db');
const StorageService = require('../../utils/bunnyUpload');
const { resolvePrice } = require('../../utils/priceResolver');
const redisClient = require('../../config/redis');

async function listProducts(req, res, next) {
  try {
    const { category_id, brand_id, is_featured, search, min_price, max_price, in_stock, min_rating, sort = 'created_at_desc', page = 1, limit = 20 } = req.query;

  const cacheKey = `products_list:${category_id || ''}:${brand_id || ''}:${is_featured || ''}:${search || ''}:${min_price || ''}:${max_price || ''}:${in_stock || ''}:${min_rating || ''}:${sort}:${page}:${limit}:user_${req.user?.id || 'guest'}:role_${req.user?.role || 'guest'}`;
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      console.log(`[Cache] HIT - Served from Redis: ${cacheKey}`);
      const parsedData = JSON.parse(cachedData);
      parsedData.meta = { cached: true };
      return res.json(parsedData);
    }

    console.log(`[Cache] MISS - Fetching from Database: ${cacheKey}`);
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClause = 'WHERE p.deleted_at IS NULL AND p.is_active = 1';
    const params = [];

    if (category_id) {
      const categories = category_id.toString().split(',');
      if (categories.length === 1) {
        whereClause += ' AND p.category_id = ?';
        params.push(categories[0]);
      } else {
        whereClause += ` AND p.category_id IN (${categories.map(() => '?').join(',')})`;
        params.push(...categories);
      }
    }
    if (brand_id) {
      const brands = brand_id.toString().split(',');
      if (brands.length === 1) {
        whereClause += ' AND p.brand_id = ?';
        params.push(brands[0]);
      } else {
        whereClause += ` AND p.brand_id IN (${brands.map(() => '?').join(',')})`;
        params.push(...brands);
      }
    }
    if (is_featured) {
      whereClause += ' AND p.is_featured = ?';
      params.push(is_featured === 'true' || is_featured === '1' ? 1 : 0);
    }
    if (search) {
      whereClause += ' AND (p.name LIKE ? OR p.short_desc LIKE ? OR p.sku LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (min_price) {
      whereClause += ' AND COALESCE(p.sale_price, p.base_price, (SELECT MIN(price) FROM product_variants WHERE product_id = p.id)) >= ?';
      params.push(parseFloat(min_price));
    }
    if (max_price) {
      whereClause += ' AND COALESCE(p.sale_price, p.base_price, (SELECT MIN(price) FROM product_variants WHERE product_id = p.id)) <= ?';
      params.push(parseFloat(max_price));
    }
    if (in_stock) {
      if (in_stock === 'true' || in_stock === '1') {
        whereClause += ' AND (p.stock_qty > 0 OR p.product_type = \'variable\')';
      } else if (in_stock === 'false' || in_stock === '0') {
        whereClause += ' AND p.stock_qty <= 0 AND p.product_type != \'variable\'';
      }
    }

    let havingClause = '';
    const havingParams = [];
    if (min_rating) {
      havingClause = 'HAVING avg_rating >= ?';
      havingParams.push(parseFloat(min_rating));
    }

    let orderBy = 'ORDER BY p.id DESC';
    if (sort === 'price_asc') orderBy = 'ORDER BY COALESCE(p.sale_price, p.base_price, (SELECT MIN(price) FROM product_variants WHERE product_id = p.id)) ASC';
    if (sort === 'price_desc') orderBy = 'ORDER BY COALESCE(p.sale_price, p.base_price, (SELECT MIN(price) FROM product_variants WHERE product_id = p.id)) DESC';
    if (sort === 'name_asc') orderBy = 'ORDER BY p.name ASC';

    // To support HAVING with aggregate, we need to inject the subquery into the count too if we use HAVING.
    // Simpler count:
    let countSql = `
      SELECT COUNT(*) as total FROM (
        SELECT p.id,
               (SELECT ROUND(AVG(rating),1) FROM product_reviews WHERE product_id = p.id AND status = 'approved') as avg_rating
        FROM products p
        ${whereClause}
        ${havingClause ? havingClause : ''}
      ) as t
    `;
    const [{ total }] = await query(countSql, [...params, ...havingParams]);

    const productsSql = `
      SELECT p.*, c.name as category_name, c.slug as category_slug, b.name as brand_name,
             (SELECT url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) as primary_image,
             (SELECT ROUND(AVG(rating),1) FROM product_reviews WHERE product_id = p.id AND status = 'approved') as avg_rating,
             (SELECT COUNT(*) FROM product_reviews WHERE product_id = p.id AND status = 'approved') as review_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      ${whereClause}
      ${havingClause ? havingClause : ''}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const products = await query(productsSql, [...params, ...havingParams, parseInt(limit, 10), offset]);

    if (products.length > 0) {
      const productIds = products.map(p => p.id);
      const productBadges = await query(
        `SELECT pb.product_id, bd.id, bd.name, bd.badge_text, bd.bg_color, bd.text_color, bd.icon
         FROM product_badges pb
         JOIN badges bd ON pb.badge_id = bd.id
         WHERE pb.product_id IN (${productIds.map(() => '?').join(',')}) AND bd.is_active = 1`,
        productIds
      );

      const badgesMap = {};
      for (const pb of productBadges) {
        if (!badgesMap[pb.product_id]) badgesMap[pb.product_id] = [];
        badgesMap[pb.product_id].push({
          id: pb.id,
          name: pb.name,
          badge_text: pb.badge_text,
          bg_color: pb.bg_color,
          text_color: pb.text_color,
          icon: pb.icon
        });
      }

      for (const p of products) {
        p.badges = badgesMap[p.id] || [];
      }
    }

    // ── Attach reseller_price for retailer users ─────────────────────────────
    if (req.user && req.user.role === 'retailer') {
      for (const p of products) {
        try {
          const priceRes = await resolvePrice({ user: req.user, product: p, qty: 1 });
          p.reseller_price = priceRes.unit_price;
          p.moq             = priceRes.moq;
        } catch (e) { /* price resolution is best-effort */ }
      }
    }

    const responseObj = {
      success: true,
      meta: { cached: false },
      data: {
        products,
        pagination: {
          total,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(total / limit)
        }
      }
    };

    let ttl = 300;
    try {
      const settingRows = await query('SELECT setting_value FROM settings WHERE setting_key = ?', ['cache_ttl_products']);
      if (settingRows && settingRows.length > 0 && settingRows[0].setting_value) {
        ttl = parseInt(settingRows[0].setting_value, 10) || 300;
      }
    } catch (e) {
      // fallback to default
    }

    await redisClient.setex(cacheKey, ttl, JSON.stringify(responseObj));

    res.json(responseObj);
  } catch (error) {
    next(error);
  }
}

async function getProductBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const products = await query(
      `SELECT p.*, c.name as category_name, b.name as brand_name,
              (SELECT ROUND(AVG(rating),1) FROM product_reviews WHERE product_id = p.id AND status = 'approved') as avg_rating,
              (SELECT COUNT(*) FROM product_reviews WHERE product_id = p.id AND status = 'approved') as review_count
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN brands b ON p.brand_id = b.id
       WHERE (p.slug = ? OR p.id = ?) AND p.deleted_at IS NULL AND p.is_active = 1
         AND (p.visible_to_resellers = 1 OR ? <> 'retailer')`,
      [slug, slug, req.user?.role || 'guest']
    );

    if (products.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const product = products[0];
    const images = await query('SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC', [product.id]);
    const variantRows = await query('SELECT * FROM product_variants WHERE product_id = ? ORDER BY id ASC', [product.id]);
    
    // Fetch attached badges
    const badges = await query(
      `SELECT bd.id, bd.name, bd.badge_text, bd.bg_color, bd.text_color, bd.icon
       FROM product_badges pb
       JOIN badges bd ON pb.badge_id = bd.id
       WHERE pb.product_id = ? AND bd.is_active = 1`,
      [product.id]
    );
    product.badges = badges || [];

    // Enrich each variant with its attribute values
    const variants = await Promise.all(variantRows.map(async (v) => {
      const attrs = await query(
        `SELECT ag.name as \`group\`, av.value, av.display_name
         FROM variant_attribute_values vav
         JOIN attribute_values av ON vav.attribute_value_id = av.id
         JOIN attribute_groups ag ON av.group_id = ag.id
         WHERE vav.variant_id = ?
         ORDER BY ag.id ASC`,
        [v.id]
      );
      const price = await resolvePrice({
        user: req.user || null,
        product,
        variant: v,
        qty: 1
      });
      return {
        ...v,
        attributes: attrs,
        resolved_price: price.unit_price,
        original_price: price.original_price,
        discount_applied: price.discount_applied,
        pricing_source: price.source,
        moq: price.moq
      };
    }));

    // ── Attach reseller_price for retailer users ─────────────────────────────
    if (req.user && req.user.role === 'retailer') {
      try {
        const priceRes = await resolvePrice({ user: req.user, product, qty: 1 });
        product.reseller_price = priceRes.unit_price;
        product.moq             = priceRes.moq;
      } catch (e) { /* best-effort */ }
    }

    res.json({
      success: true,
      data: {
        product,
        images,
        variants
      }
    });
  } catch (error) {
    next(error);
  }
}

async function createProduct(req, res, next) {
  try {
    const {
      category_id, brand_id, name, slug, short_desc, description, product_type = 'simple',
      base_price, sale_price, cost_price, sku, barcode, tax_class = 'standard', tax_rate = 18.00,
      hsn_code, weight_grams, length_cm, width_cm, height_cm, track_inventory = 1, stock_qty = 0,
      low_stock_threshold = 5, is_active = 1, is_featured = 0
    } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ success: false, message: 'Name and slug are required' });
    }
    // base_price is required for simple products only (variable products set a listing price)
    if (product_type !== 'variable' && !base_price) {
      return res.status(400).json({ success: false, message: 'base_price is required for simple products' });
    }

    const result = await query(
      `INSERT INTO products
        (category_id, brand_id, name, slug, short_desc, description, product_type, base_price, sale_price, cost_price, sku, barcode, tax_class, tax_rate, hsn_code, weight_grams, length_cm, width_cm, height_cm, track_inventory, stock_qty, low_stock_threshold, is_active, is_featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category_id || null, brand_id || null, name, slug, short_desc || null, description || null,
        product_type, base_price, sale_price || null, cost_price || null, sku || null, barcode || null,
        tax_class, tax_rate, hsn_code || null, weight_grams || null, length_cm || null, width_cm || null,
        height_cm || null, track_inventory ? 1 : 0, stock_qty || 0, low_stock_threshold || 5,
        is_active ? 1 : 0, is_featured ? 1 : 0
      ]
    );

    const productId = result.insertId;
    if (Array.isArray(req.body.badge_ids)) {
      for (const badgeId of req.body.badge_ids) {
        await query('INSERT IGNORE INTO product_badges (product_id, badge_id) VALUES (?, ?)', [productId, badgeId]);
      }
    }

    res.status(201).json({ success: true, message: 'Product created successfully', data: { id: productId } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'A product with this slug already exists. Please choose a unique slug.' });
    }
    next(error);
  }
}

async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const {
      category_id, brand_id, name, slug, short_desc, description, product_type,
      base_price, sale_price, cost_price, sku, barcode, tax_class, tax_rate,
      hsn_code, weight_grams, length_cm, width_cm, height_cm, track_inventory, stock_qty,
      low_stock_threshold, is_active, is_featured, badge_ids
    } = req.body;

    const n = (val) => val === '' ? null : val;

    await query(
      `UPDATE products SET
        category_id = COALESCE(?, category_id), brand_id = COALESCE(?, brand_id), name = COALESCE(?, name),
        slug = COALESCE(?, slug), short_desc = COALESCE(?, short_desc), description = COALESCE(?, description),
        product_type = COALESCE(?, product_type), base_price = COALESCE(?, base_price), sale_price = COALESCE(?, sale_price),
        cost_price = COALESCE(?, cost_price), sku = COALESCE(?, sku), barcode = COALESCE(?, barcode),
        tax_class = COALESCE(?, tax_class), tax_rate = COALESCE(?, tax_rate), hsn_code = COALESCE(?, hsn_code),
        weight_grams = COALESCE(?, weight_grams), length_cm = COALESCE(?, length_cm), width_cm = COALESCE(?, width_cm),
        height_cm = COALESCE(?, height_cm), track_inventory = COALESCE(?, track_inventory), stock_qty = COALESCE(?, stock_qty),
        low_stock_threshold = COALESCE(?, low_stock_threshold), is_active = COALESCE(?, is_active), is_featured = COALESCE(?, is_featured)
       WHERE id = ? AND deleted_at IS NULL`,
      [
        n(category_id), n(brand_id), name, slug, n(short_desc), n(description), product_type,
        n(base_price), n(sale_price), n(cost_price), n(sku), n(barcode), tax_class, n(tax_rate),
        n(hsn_code), n(weight_grams), n(length_cm), n(width_cm), n(height_cm), track_inventory, stock_qty,
        low_stock_threshold, is_active, is_featured, id
      ]
    );

    if (Array.isArray(badge_ids)) {
      await query('DELETE FROM product_badges WHERE product_id = ?', [id]);
      for (const badgeId of badge_ids) {
        await query('INSERT IGNORE INTO product_badges (product_id, badge_id) VALUES (?, ?)', [id, badgeId]);
      }
    }

    res.json({ success: true, message: 'Product updated successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'A product with this slug already exists. Please choose a unique slug.' });
    }
    next(error);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;
    await query('UPDATE products SET deleted_at = NOW() WHERE id = ?', [id]);
    res.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
}

async function uploadProductImage(req, res, next) {
  try {
    const { id } = req.params;
    const { url, alt_text, is_primary, sort_order } = req.body;

    let imageUrl = url;
    if (req.file) {
      const filename = `${Date.now()}-${req.file.originalname.replace(/\\s+/g, '_')}`;
      imageUrl = await StorageService.uploadToBunny(filename, req.file.buffer, req.file.mimetype);
    }

    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'Image URL or file required' });
    }

    if (is_primary) {
      await query('UPDATE product_images SET is_primary = 0 WHERE product_id = ?', [id]);
    }

    const result = await query(
      'INSERT INTO product_images (product_id, url, alt_text, sort_order, is_primary) VALUES (?, ?, ?, ?, ?)',
      [id, imageUrl, alt_text || null, sort_order || 0, is_primary ? 1 : 0]
    );

    res.status(201).json({ success: true, message: 'Product image uploaded', data: { id: result.insertId, url: imageUrl } });
  } catch (error) {
    next(error);
  }
}

async function deleteProductImage(req, res, next) {
  try {
    const { id, imgId } = req.params;
    await query('DELETE FROM product_images WHERE id = ? AND product_id = ?', [imgId, id]);
    res.json({ success: true, message: 'Image deleted' });
  } catch (error) {
    next(error);
  }
}

async function reorderProductImages(req, res, next) {
  try {
    const { id } = req.params;
    const { images } = req.body; // [{ id, sort_order, is_primary }]
    if (!Array.isArray(images)) {
      return res.status(400).json({ success: false, message: 'Images array required' });
    }

    for (const img of images) {
      await query(
        'UPDATE product_images SET sort_order = ?, is_primary = ? WHERE id = ? AND product_id = ?',
        [img.sort_order, img.is_primary ? 1 : 0, img.id, id]
      );
    }

    res.json({ success: true, message: 'Images reordered' });
  } catch (error) {
    next(error);
  }
}

async function listVariants(req, res, next) {
  try {
    const { id } = req.params;
    const variantRows = await query('SELECT * FROM product_variants WHERE product_id = ? ORDER BY id ASC', [id]);
    const variants = await Promise.all(variantRows.map(async (v) => {
      const attrs = await query(
        `SELECT ag.name as \`group\`, av.value, av.display_name
         FROM variant_attribute_values vav
         JOIN attribute_values av ON vav.attribute_value_id = av.id
         JOIN attribute_groups ag ON av.group_id = ag.id
         WHERE vav.variant_id = ? ORDER BY ag.id ASC`,
        [v.id]
      );
      return { ...v, attributes: attrs };
    }));
    res.json({ success: true, data: { variants } });
  } catch (error) {
    next(error);
  }
}

async function createVariant(req, res, next) {
  try {
    const { id } = req.params;
    const { sku, barcode, price, sale_price, cost_price, stock_qty = 0, weight_grams, image, variant_label, attributes = [] } = req.body;
    if (!sku || !price) {
      return res.status(400).json({ success: false, message: 'SKU and price are required' });
    }

    const result = await query(
      `INSERT INTO product_variants (product_id, sku, variant_label, barcode, price, sale_price, cost_price, stock_qty, weight_grams, image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, sku, variant_label || null, barcode || null, price, sale_price || null, cost_price || null, stock_qty, weight_grams || null, image || null]
    );
    const variantId = result.insertId;

    if (Array.isArray(attributes) && attributes.length > 0) {
      for (const attr of attributes) {
        const { group_name, value } = attr;
        if (!group_name || !value) continue;
        let [group] = await query('SELECT id FROM attribute_groups WHERE name = ?', [group_name]);
        if (!group) {
          const gr = await query('INSERT INTO attribute_groups (name, slug) VALUES (?, ?)', [group_name, group_name.toLowerCase()]);
          group = { id: gr.insertId };
        }
        let [av] = await query('SELECT id FROM attribute_values WHERE group_id = ? AND value = ?', [group.id, value]);
        if (!av) {
          const avr = await query('INSERT INTO attribute_values (group_id, value, display_name) VALUES (?, ?, ?)', [group.id, value, value]);
          av = { id: avr.insertId };
        }
        await query('INSERT IGNORE INTO variant_attribute_values (variant_id, attribute_value_id) VALUES (?, ?)', [variantId, av.id]);
      }
    }

    res.status(201).json({ success: true, message: 'Variant created', data: { id: variantId } });
  } catch (error) {
    next(error);
  }
}

async function updateVariant(req, res, next) {
  try {
    const { id, varId } = req.params;
    const { sku, barcode, price, sale_price, cost_price, stock_qty, weight_grams, image, is_active, variant_label, attributes } = req.body;

    await query(
      `UPDATE product_variants SET sku = COALESCE(?, sku), variant_label = COALESCE(?, variant_label), barcode = COALESCE(?, barcode), price = COALESCE(?, price), sale_price = COALESCE(?, sale_price), cost_price = COALESCE(?, cost_price), stock_qty = COALESCE(?, stock_qty), weight_grams = COALESCE(?, weight_grams), image = COALESCE(?, image), is_active = COALESCE(?, is_active) WHERE id = ? AND product_id = ?`,
      [sku, variant_label, barcode, price, sale_price, cost_price, stock_qty, weight_grams, image, is_active, varId, id]
    );

    if (Array.isArray(attributes)) {
      await query('DELETE FROM variant_attribute_values WHERE variant_id = ?', [varId]);
      for (const attr of attributes) {
        const { group_name, value } = attr;
        if (!group_name || !value) continue;
        let [group] = await query('SELECT id FROM attribute_groups WHERE name = ?', [group_name]);
        if (!group) {
          const gr = await query('INSERT INTO attribute_groups (name, slug) VALUES (?, ?)', [group_name, group_name.toLowerCase()]);
          group = { id: gr.insertId };
        }
        let [av] = await query('SELECT id FROM attribute_values WHERE group_id = ? AND value = ?', [group.id, value]);
        if (!av) {
          const avr = await query('INSERT INTO attribute_values (group_id, value, display_name) VALUES (?, ?, ?)', [group.id, value, value]);
          av = { id: avr.insertId };
        }
        await query('INSERT IGNORE INTO variant_attribute_values (variant_id, attribute_value_id) VALUES (?, ?)', [varId, av.id]);
      }
    }

    res.json({ success: true, message: 'Variant updated' });
  } catch (error) {
    next(error);
  }
}

async function deleteVariant(req, res, next) {
  try {
    const { id, varId } = req.params;
    await query('DELETE FROM variant_attribute_values WHERE variant_id = ?', [varId]);
    await query('DELETE FROM product_variants WHERE id = ? AND product_id = ?', [varId, id]);
    res.json({ success: true, message: 'Variant deleted' });
  } catch (error) {
    next(error);
  }
}

async function getInventoryLog(req, res, next) {
  try {
    const { id } = req.params;
    const logs = await query(
      `SELECT il.*, u.name as performed_by_name
       FROM inventory_log il
       LEFT JOIN users u ON il.performed_by = u.id
       WHERE il.product_id = ?
       ORDER BY il.id DESC`,
      [id]
    );

    res.json({ success: true, data: { logs } });
  } catch (error) {
    next(error);
  }
}

async function adjustInventory(req, res, next) {
  try {
    const { id } = req.params;
    const { variant_id, movement = 'adjustment', qty = 0, note } = req.body;

    const adjustmentQty = parseInt(qty, 10);
    if (isNaN(adjustmentQty) || adjustmentQty === 0) {
      return res.status(400).json({ success: false, message: 'Valid non-zero quantity is required' });
    }

    let qtyBefore = 0;
    let qtyAfter = 0;

    if (variant_id) {
      const [variant] = await query('SELECT stock_qty FROM product_variants WHERE id = ? AND product_id = ?', [variant_id, id]);
      if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });
      qtyBefore = variant.stock_qty;
      qtyAfter = movement === 'out' || movement === 'reserved' ? qtyBefore - Math.abs(adjustmentQty) : qtyBefore + adjustmentQty;
      await query('UPDATE product_variants SET stock_qty = ? WHERE id = ?', [qtyAfter, variant_id]);
    } else {
      const [product] = await query('SELECT stock_qty FROM products WHERE id = ?', [id]);
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
      qtyBefore = product.stock_qty;
      qtyAfter = movement === 'out' || movement === 'reserved' ? qtyBefore - Math.abs(adjustmentQty) : qtyBefore + adjustmentQty;
      await query('UPDATE products SET stock_qty = ? WHERE id = ?', [qtyAfter, id]);
    }

    const result = await query(
      `INSERT INTO inventory_log
        (product_id, variant_id, movement, qty, qty_before, qty_after, ref_type, note, performed_by)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
      [id, variant_id || null, movement, adjustmentQty, qtyBefore, qtyAfter, note || null, req.user?.id || null]
    );

    const eventBus = require('../../events/bus');
    eventBus.emit('inventory.adjusted', {
      product_id: parseInt(id, 10),
      variant_id: variant_id ? parseInt(variant_id, 10) : null,
      qty_after: qtyAfter,
      movement
    });

    res.json({
      success: true,
      message: 'Inventory adjusted successfully',
      data: {
        log_id: result.insertId,
        product_id: parseInt(id, 10),
        qty_before: qtyBefore,
        qty_after: qtyAfter
      }
    });
  } catch (error) {
    next(error);
  }
}

async function listLowStockProducts(req, res, next) {
  try {
    const products = await query(
      `SELECT p.id, p.name, p.sku, p.stock_qty, p.low_stock_threshold,
              (SELECT MAX(notified_at) FROM low_stock_alerts WHERE product_id = p.id) as last_alert
       FROM products p
       WHERE p.deleted_at IS NULL AND p.stock_qty <= p.low_stock_threshold
       ORDER BY p.stock_qty ASC`
    );

    res.json({ success: true, data: { products } });
  } catch (error) {
    next(error);
  }
}

async function exportProducts(req, res, next) {
  try {
    const products = await query('SELECT sku, name, slug, base_price, sale_price, cost_price, stock_qty, low_stock_threshold, is_active FROM products WHERE deleted_at IS NULL ORDER BY id ASC');
    let csv = 'sku,name,slug,base_price,sale_price,cost_price,stock_qty,low_stock_threshold,is_active\n';
    for (const p of (products || [])) {
      csv += `"${p.sku || ''}","${p.name || ''}","${p.slug || ''}",${p.base_price || 0},${p.sale_price || ''},${p.cost_price || ''},${p.stock_qty || 0},${p.low_stock_threshold || 5},${p.is_active}\n`;
    }
    res.header('Content-Type', 'text/csv');
    res.attachment('products_export.csv');
    res.send(csv);
  } catch (error) {
    next(error);
  }
}

async function importProducts(req, res, next) {
  try {
    const { csv_data } = req.body;
    if (!csv_data || typeof csv_data !== 'string') {
      return res.status(400).json({ success: false, message: 'CSV data string is required in body.' });
    }

    const lines = csv_data.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      return res.status(400).json({ success: false, message: 'CSV must contain a header row and at least one data row.' });
    }

    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
    const skuIdx = headers.indexOf('sku');
    const nameIdx = headers.indexOf('name');
    const slugIdx = headers.indexOf('slug');
    const priceIdx = headers.indexOf('base_price');
    const stockIdx = headers.indexOf('stock_qty');

    if (skuIdx === -1 || nameIdx === -1 || priceIdx === -1) {
      return res.status(400).json({ success: false, message: 'CSV must contain sku, name, and base_price columns.' });
    }

    let importedCount = 0;
    const errors = [];
    const eventBus = require('../../events/bus');

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
      const sku = cols[skuIdx];
      const name = cols[nameIdx];
      const base_price = parseFloat(cols[priceIdx]);
      const slug = slugIdx !== -1 && cols[slugIdx] ? cols[slugIdx] : (name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : `prod-${Date.now()}`);
      const stock_qty = stockIdx !== -1 && cols[stockIdx] ? parseInt(cols[stockIdx], 10) : 0;

      if (!sku || !name || isNaN(base_price)) {
        errors.push({ line: i + 1, error: 'Missing required sku, name, or invalid base_price' });
        continue;
      }

      await query(
        `INSERT INTO products (sku, name, slug, base_price, stock_qty, is_active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE name = VALUES(name), base_price = VALUES(base_price), stock_qty = VALUES(stock_qty)`,
        [sku, name, slug, base_price, stock_qty]
      );
      importedCount++;
    }

    // Emit ONE SINGLE batched event for cache invalidation per §6.9
    eventBus.emit('product.changed', { batch_import: true, count: importedCount });

    res.json({
      success: true,
      data: { imported_count: importedCount, errors },
      message: `Successfully imported/upserted ${importedCount} products.`
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listProducts,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  deleteProductImage,
  reorderProductImages,
  listVariants,
  createVariant,
  updateVariant,
  deleteVariant,
  getInventoryLog,
  adjustInventory,
  listLowStockProducts,
  exportProducts,
  importProducts
};
