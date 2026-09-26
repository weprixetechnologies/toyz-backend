const { getProductMoq, resolvePrice } = require('../../utils/priceResolver');
const { query, pool } = require('../../config/db');
const eventBus = require('../../events/bus');

async function placeOrder(req, res, next) {
  const connection = await pool.getConnection();
  try {
    // 1. Checkout Gate: Validate at least one payment method (COD or Gateway) is active
    const [codSetting] = await connection.query("SELECT setting_value FROM settings WHERE setting_key = 'cod_enabled'");
    const isCodEnabled = codSetting.length > 0 && codSetting[0]?.setting_value === '1';

    const [activeGateways] = await connection.query("SELECT COUNT(*) as count FROM payment_gateways WHERE is_active = 1");
    const isGatewayEnabled = activeGateways.length > 0 && activeGateways[0]?.count > 0;

    if (!isCodEnabled && !isGatewayEnabled) {
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'No payment method available. Checkout is currently disabled.'
      });
    }

    const { shipping_address_id, shipping_address, billing_gstin, notes, is_buy_now, buy_now_item, coupon_code } = req.body;
    let address = shipping_address;

    if (shipping_address_id && !address) {
      const [addresses] = await connection.query('SELECT * FROM user_addresses WHERE id = ? AND user_id = ?', [shipping_address_id, req.user.id]);
      if (addresses.length === 0) {
        connection.release();
        return res.status(400).json({ success: false, message: 'Invalid shipping address ID' });
      }
      address = addresses[0];
    }

    if (!address || !address.line1 || !address.city || !address.state || !address.pin_code) {
      connection.release();
      return res.status(400).json({ success: false, message: 'Complete shipping address is required' });
    }

    let cartItems = [];
    let cartId = null;

    if (is_buy_now && buy_now_item) {
      const { product_id, variant_id, qty } = buy_now_item;
      let queryStr = `
        SELECT p.name as product_name, p.sku as product_sku, p.base_price, p.sale_price, p.tax_rate, p.stock_qty as p_stock, p.id as product_id,
               pv.id as variant_id, pv.sku as variant_sku, pv.price as variant_price, pv.sale_price as variant_sale_price, pv.stock_qty as pv_stock
        FROM products p
        LEFT JOIN product_variants pv ON pv.id = ?
        WHERE p.id = ?
      `;
      const [items] = await connection.query(queryStr, [variant_id || null, product_id]);
      if (items.length === 0) {
        connection.release();
        return res.status(400).json({ success: false, message: 'Product not found' });
      }
      items[0].qty = qty || 1;
      cartItems = items;
    } else {
      // 2. Fetch cart items
      const [carts] = await connection.query('SELECT id FROM carts WHERE user_id = ?', [req.user.id]);
      if (carts.length === 0) {
        connection.release();
        return res.status(400).json({ success: false, message: 'Cart is empty' });
      }
      cartId = carts[0].id;
      const [cItems] = await connection.query(
        `SELECT ci.*, p.name as product_name, p.sku as product_sku, p.base_price, p.sale_price, p.tax_rate, p.stock_qty as p_stock, p.id as product_id,
                pv.sku as variant_sku, pv.price as variant_price, pv.sale_price as variant_sale_price, pv.stock_qty as pv_stock
         FROM cart_items ci
         JOIN products p ON ci.product_id = p.id
         LEFT JOIN product_variants pv ON ci.variant_id = pv.id
         WHERE ci.cart_id = ?`,
        [cartId]
      );
      if (cItems.length === 0) {
        connection.release();
        return res.status(400).json({ success: false, message: 'Cart is empty' });
      }
      cartItems = cItems;
    }

    // 3. MOQ Check for Retailers
    const isRetailer = req.user.role === 'retailer';
    if (isRetailer) {
      const { getProductMoq } = require('../../utils/priceResolver');
      for (const item of cartItems) {
        const moq = await getProductMoq(item.product_id, item.variant_id, req.user);
        if (item.qty < moq) {
          connection.release();
          return res.status(400).json({
            success: false,
            message: `Minimum order quantity (MOQ) of ${moq} required for product '${item.product_name}'`
          });
        }
      }
    }

    // 4. Determine Initial Order Status (pending_approval vs pending)
    let initialStatus = 'pending';
    if (isRetailer) {
      const [approvalSetting] = await connection.query("SELECT setting_value FROM settings WHERE setting_key = 'reseller_order_approval'");
      if (approvalSetting.length > 0 && approvalSetting[0].setting_value === '1') {
        initialStatus = 'pending_approval';
      }
    }

    // 5. Begin DB Transaction
    await connection.beginTransaction();

    let subtotal = 0;
    const orderItemsData = [];

    for (const item of cartItems) {
      const pObj = { id: item.product_id, base_price: item.base_price, sale_price: item.sale_price };
      const vObj = item.variant_id ? { id: item.variant_id, price: item.variant_price, sale_price: item.variant_sale_price } : null;
      const priceRes = await resolvePrice({ user: req.user, product: pObj, variant: vObj, qty: item.qty });
      const unitPrice = priceRes.unit_price;

      const lineTotal = unitPrice * item.qty;
      subtotal += lineTotal;

      orderItemsData.push({
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name: item.product_name,
        variant_label: item.variant_sku || null,
        sku: item.variant_sku || item.product_sku,
        qty_ordered: item.qty,
        unit_price: unitPrice,
        tax_rate: item.tax_rate || 0,
        line_total: lineTotal
      });

      // Decrement stock
      if (item.variant_id) {
        await connection.query('UPDATE product_variants SET stock_qty = GREATEST(0, stock_qty - ?) WHERE id = ?', [item.qty, item.variant_id]);
      } else {
        await connection.query('UPDATE products SET stock_qty = GREATEST(0, stock_qty - ?) WHERE id = ?', [item.qty, item.product_id]);
      }
    }

    // Evaluate offers & coupons
    const { evaluateOffers } = require('../../utils/offerEngine');
    const evaluation = await evaluateOffers({
      subtotal,
      userRole: req.user.role || 'customer',
      couponCode: coupon_code || null,
      userId: req.user.id
    });
    
    // Fallback gracefully if evaluateOffers fails
    const finalSubtotal = evaluation ? evaluation.final_subtotal : subtotal;
    const offerDiscount = evaluation ? evaluation.offer_discount : 0;
    const couponDiscount = evaluation ? evaluation.coupon_discount : 0;
    const totalDiscount = evaluation ? evaluation.total_discount : 0;
    const appliedCoupon = (evaluation && evaluation.applied_coupon && evaluation.applied_coupon.valid !== false) ? evaluation.applied_coupon.code : null;

    // Shipping cost lookup
    let shippingCost = 0;
    if (isRetailer) {
      shippingCost = 0;
    } else {
      const pinCode = address.pin_code;
      const [presetRes] = await connection.query('SELECT cost FROM shipping_presets WHERE label = ? AND is_active = 1 LIMIT 1', [pinCode]);
      if (presetRes.length > 0) {
        shippingCost = parseFloat(presetRes[0].cost);
      } else {
        const [shippingSetting] = await connection.query("SELECT setting_value FROM settings WHERE setting_key = 'global_shipping_fee'");
        shippingCost = parseFloat(shippingSetting[0]?.setting_value || '50.00');
      }
    }

    const grandTotal = finalSubtotal + shippingCost;
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const orderNumber = `ORD-${dateStr}-${randomSuffix}`;

    const refCode = req.body.ref_code || (req.cookies && req.cookies.ref) || null;

    // Insert Order
    const [orderRes] = await connection.query(
      `INSERT INTO orders
        (order_number, user_id, placed_by_role, status, shipping_name, shipping_phone, shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_pin, shipping_country, billing_name, billing_gstin, subtotal, discount_amount, coupon_code, coupon_discount, shipping_cost, grand_total, payment_method, is_cod, ref_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cod', 1, ?)`,
      [
        orderNumber,
        req.user.id,
        isRetailer ? 'retailer' : 'customer',
        initialStatus,
        address.name || req.user.name,
        address.phone || req.user.phone,
        address.line1,
        address.line2 || null,
        address.city,
        address.state,
        address.pin_code,
        address.country || 'India',
        address.name || req.user.name,
        billing_gstin || req.user.gstin || null,
        subtotal,
        offerDiscount, // Maps to discount_amount (general offers)
        appliedCoupon,
        couponDiscount,
        shippingCost,
        grandTotal,
        refCode
      ]
    );

    const orderId = orderRes.insertId;

    // Insert Order Items
    for (const item of orderItemsData) {
      await connection.query(
        `INSERT INTO order_items
          (order_id, product_id, variant_id, product_name, variant_label, sku, qty_ordered, unit_price, tax_rate, line_total, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [orderId, item.product_id, item.variant_id, item.product_name, item.variant_label, item.sku, item.qty_ordered, item.unit_price, item.tax_rate, item.line_total]
      );
    }

    // Clear cart items ONLY IF NOT buy now
    if (!is_buy_now && cartId) {
      await connection.query('DELETE FROM cart_items WHERE cart_id = ?', [cartId]);
    }

    await connection.commit();
    connection.release();

    const orderData = {
      id: orderId,
      order_number: orderNumber,
      user_id: req.user.id,
      user_phone: req.user.phone,
      status: initialStatus,
      shipping_name: address.name || req.user.name,
      shipping_phone: address.phone || req.user.phone,
      grand_total: grandTotal,
      subtotal,
      shipping_cost: shippingCost,
      ref_code: refCode
    };

    // Emit order.placed event asynchronously
    eventBus.emit('order.placed', orderData);

    res.status(201).json({
      success: true,
      message: 'Order placed successfully',
      data: { order: orderData }
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    next(error);
  }
}

async function listOwnOrders(req, res, next) {
  try {
    const orders = await query('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
    for (const order of orders) {
      const items = await query(
        `SELECT oi.*, p.slug, 
          (SELECT url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) as product_image
         FROM order_items oi
         LEFT JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`, 
        [order.id]
      );
      order.items = items || [];
    }
    res.json({ success: true, data: { orders } });
  } catch (error) {
    next(error);
  }
}

async function fetchOrderShipments(orderId) {
  const shipments = await query('SELECT * FROM shipments WHERE order_id = ? ORDER BY id ASC', [orderId]);
  for (const s of shipments) {
    const sItems = await query(
      `SELECT si.*, oi.product_name, oi.sku
       FROM shipment_items si
       JOIN order_items oi ON si.order_item_id = oi.id
       WHERE si.shipment_id = ?`,
      [s.id]
    );
    s.items = sItems || [];
    s.tracking_carrier = s.carrier || s.tracking_carrier || 'Express Logistics';
  }
  return shipments || [];
}

async function getOwnOrderDetail(req, res, next) {
  try {
    const { id } = req.params;
    const orders = await query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const items = await query('SELECT * FROM order_items WHERE order_id = ?', [id]);
    const shipments = await fetchOrderShipments(id);
    res.json({ success: true, data: { order: orders[0], items, shipments } });
  } catch (error) {
    next(error);
  }
}

async function cancelOwnOrder(req, res, next) {
  try {
    const { id } = req.params;
    const orders = await query("SELECT * FROM orders WHERE id = ? AND user_id = ? AND status IN ('pending', 'pending_approval')", [id, req.user.id]);
    if (orders.length === 0) {
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });
    }

    await query("UPDATE orders SET status = 'cancelled' WHERE id = ?", [id]);
    res.json({ success: true, message: 'Order cancelled successfully' });
  } catch (error) {
    next(error);
  }
}

// Admin Order Endpoints
async function listAdminOrders(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let whereClause = '';
    const params = [];
    if (status) {
      whereClause = 'WHERE status = ?';
      params.push(status);
    }

    const [{ total }] = await query(`SELECT COUNT(*) as total FROM orders ${whereClause}`, params);
    const orders = await query(`SELECT * FROM orders ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit, 10), offset]);

    res.json({
      success: true,
      data: {
        orders,
        pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), pages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getAdminOrderDetail(req, res, next) {
  try {
    const { id } = req.params;
    const orders = await query('SELECT * FROM orders WHERE id = ?', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const items = await query('SELECT * FROM order_items WHERE order_id = ?', [id]);
    const shipments = await fetchOrderShipments(id);
    res.json({ success: true, data: { order: orders[0], items, shipments } });
  } catch (error) {
    next(error);
  }
}

async function updateOrderStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    await query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    res.json({
      success: true,
      data: { id: parseInt(id, 10), status, order_status: status },
      message: `Order status updated to '${status}'`
    });
  } catch (error) {
    next(error);
  }
}

async function updateOrderShipping(req, res, next) {
  try {
    const { id } = req.params;
    const { tracking_number, tracking_carrier, tracking_note, shipping_cost } = req.body;

    if (shipping_cost !== undefined) {
      const orders = await query('SELECT subtotal, discount_amount, tax_amount FROM orders WHERE id = ?', [id]);
      if (orders.length > 0) {
        const o = orders[0];
        const sc = parseFloat(shipping_cost) || 0;
        const newGrandTotal = parseFloat(o.subtotal) + sc + parseFloat(o.tax_amount || 0) - parseFloat(o.discount_amount || 0);
        await query(
          'UPDATE orders SET shipping_cost = ?, grand_total = ? WHERE id = ?',
          [sc, newGrandTotal, id]
        );
      }
    }

    if (tracking_number !== undefined || tracking_carrier !== undefined || tracking_note !== undefined) {
      await query(
        'UPDATE orders SET tracking_number = COALESCE(?, tracking_number), tracking_carrier = COALESCE(?, tracking_carrier), tracking_note = COALESCE(?, tracking_note) WHERE id = ?',
        [tracking_number, tracking_carrier, tracking_note, id]
      );
    }

    res.json({ success: true, message: 'Order shipping updated' });
  } catch (error) {
    next(error);
  }
}

async function downloadInvoice(req, res, next) {
  try {
    const { id } = req.params;
    const orders = await query('SELECT * FROM orders WHERE id = ? AND (user_id = ? OR ? IN ("admin","superadmin","support_agent"))', [id, req.user.id, req.user.role]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orders[0];
    const items = await query('SELECT * FROM order_items WHERE order_id = ?', [id]);
    const settingsList = await query('SELECT setting_key, setting_value FROM settings');
    const settings = {};
    settingsList.forEach((s) => settings[s.setting_key] = s.setting_value);

    const { generateInvoiceHtml } = require('../../utils/invoicePdf');
    const html = generateInvoiceHtml(order, items, settings);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    next(error);
  }
}

async function downloadPackingSlip(req, res, next) {
  try {
    const { id } = req.params;
    const orders = await query('SELECT * FROM orders WHERE id = ?', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orders[0];
    const items = await query('SELECT * FROM order_items WHERE order_id = ?', [id]);
    const settingsList = await query('SELECT setting_key, setting_value FROM settings');
    const settings = {};
    settingsList.forEach((s) => settings[s.setting_key] = s.setting_value);

    const { generatePackingSlipHtml } = require('../../utils/invoicePdf');
    const html = generatePackingSlipHtml(order, items, settings);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    next(error);
  }
}

async function bulkUpdateOrderStatus(req, res, next) {
  try {
    const { order_ids, status, note } = req.body;
    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0 || !status) {
      return res.status(400).json({ success: false, message: 'Array of order_ids and status are required' });
    }

    const validStatuses = ['pending_approval', 'pending', 'processing', 'partially_shipped', 'shipped', 'delivered', 'cancelled', 'refund_requested', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid order status specified' });
    }

    const placeholders = order_ids.map(() => '?').join(',');
    await query(
      `UPDATE orders SET status = ?, admin_note = COALESCE(?, admin_note) WHERE id IN (${placeholders})`,
      [status, note || null, ...order_ids]
    );

    res.json({
      success: true,
      data: { updated_count: order_ids.length, status },
      message: `Bulk updated ${order_ids.length} orders to '${status}'`
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  placeOrder,
  listOwnOrders,
  getOwnOrderDetail,
  cancelOwnOrder,
  listAdminOrders,
  getAdminOrderDetail,
  updateOrderStatus,
  updateOrderShipping,
  downloadInvoice,
  downloadPackingSlip,
  bulkUpdateOrderStatus
};
