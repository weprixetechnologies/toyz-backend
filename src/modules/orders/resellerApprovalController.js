const { query, pool } = require('../../config/db');
const eventBus = require('../../events/bus');

async function listPendingResellerOrders(req, res, next) {
  try {
    const orders = await query(
      `SELECT o.*, u.name as reseller_name, u.email as reseller_email, u.phone as reseller_phone
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.status = 'pending_approval' AND o.placed_by_role = 'retailer'
       ORDER BY o.id DESC`
    );

    res.json({ success: true, data: { orders } });
  } catch (error) {
    next(error);
  }
}

async function approveResellerOrder(req, res, next) {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { items } = req.body; // [{ id: order_item_id, qty_approved: N, admin_note: '' }]

    if (!Array.isArray(items) || items.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, message: 'Items array is required' });
    }

    const [orders] = await connection.query('SELECT * FROM orders WHERE id = ?', [id]);
    if (orders.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = orders[0];
    if (order.placed_by_role !== 'retailer' || order.status !== 'pending_approval') {
      connection.release();
      return res.status(409).json({ success: false, message: 'Only pending retailer orders can be approved.' });
    }
    const [allOrderItems] = await connection.query('SELECT * FROM order_items WHERE order_id = ?', [id]);
    const inputIds = new Set(items.map(item => String(item.id)));
    if (allOrderItems.some(item => !inputIds.has(String(item.id)))) {
      connection.release();
      return res.status(400).json({ success: false, message: 'Approval decisions are required for every order item.' });
    }
    await connection.beginTransaction();

    let approvedCount = 0;
    let rejectedCount = 0;
    const itemSummaryParts = [];

    for (const itemInput of items) {
      const [orderItems] = await connection.query('SELECT * FROM order_items WHERE id = ? AND order_id = ?', [itemInput.id, id]);
      if (orderItems.length === 0) continue;

      const orderItem = orderItems[0];
      const qtyRequested = orderItem.qty_ordered;
      const requestedApproved = parseInt(itemInput.qty_approved, 10);
      if (!Number.isInteger(requestedApproved) || requestedApproved < 0 || requestedApproved > qtyRequested) {
        throw Object.assign(new Error(`Invalid approved quantity for '${orderItem.product_name}'`), { statusCode: 400 });
      }
      const qtyApproved = requestedApproved;
      const qtyRejected = qtyRequested - qtyApproved;

      let itemStatus = 'approved';
      let action = 'approved';

      if (qtyApproved === 0) {
        itemStatus = 'rejected';
        action = 'rejected';
        rejectedCount++;
      } else if (qtyApproved < qtyRequested) {
        itemStatus = 'partially_approved';
        action = 'partially_approved';
        approvedCount++;
      } else {
        approvedCount++;
      }

      const newLineTotal = (orderItem.admin_unit_price || orderItem.unit_price) * qtyApproved;

      await connection.query(
        `UPDATE order_items SET qty_approved = ?, qty_rejected = ?, status = ?, line_total = ? WHERE id = ?`,
        [qtyApproved, qtyRejected, itemStatus, newLineTotal, orderItem.id]
      );

      // Audit Log Entry per item
      await connection.query(
        `INSERT INTO reseller_approval_log
          (order_id, order_item_id, action, qty_requested, qty_approved, admin_note, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, orderItem.id, action, qtyRequested, qtyApproved, itemInput.admin_note || null, req.user.id]
      );

      // Stock is reserved at order time. If an admin already edited this line,
      // only release the newly rejected portion that is still reserved.
      const previouslyReserved = orderItem.qty_approved !== null && orderItem.qty_approved !== undefined
        ? parseInt(orderItem.qty_approved, 10)
        : qtyRequested;
      const newlyReleasedQty = Math.max(0, previouslyReserved - qtyApproved);
      if (newlyReleasedQty > 0) {
        if (orderItem.variant_id) {
          await connection.query('UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?', [newlyReleasedQty, orderItem.variant_id]);
        } else {
          await connection.query('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?', [newlyReleasedQty, orderItem.product_id]);
        }
      }

      itemSummaryParts.push(`${orderItem.product_name} (${qtyApproved}/${qtyRequested})`);
    }

    // Determine final Order Status
    let newOrderStatus = 'processing';
    if (approvedCount === 0 && rejectedCount > 0) {
      newOrderStatus = 'cancelled';
    }

    const [approvedTotals] = await connection.query(
      'SELECT COALESCE(SUM(line_total), 0) AS subtotal FROM order_items WHERE order_id = ? AND status != "rejected"',
      [id]
    );
    const approvedSubtotal = parseFloat(approvedTotals[0]?.subtotal || 0);
    await connection.query(
      'UPDATE orders SET status = ?, subtotal = ?, discount_amount = 0, coupon_code = NULL, coupon_discount = 0, grand_total = ? + shipping_cost WHERE id = ?',
      [newOrderStatus, approvedSubtotal, approvedSubtotal, id]
    );
    await connection.commit();
    connection.release();

    const [users] = await query('SELECT name, phone FROM users WHERE id = ?', [order.user_id]);
    const user = users[0] || {};

    // Emit order.approved event
    eventBus.emit('order.approved', {
      order_id: order.id,
      order_number: order.order_number,
      user_id: order.user_id,
      name: user.name || 'Reseller',
      phone: user.phone || order.shipping_phone,
      items_summary: itemSummaryParts.join(', ')
    });

    res.json({
      success: true,
      message: `Reseller order updated to status '${newOrderStatus}'`,
      data: { order_id: order.id, status: newOrderStatus, items_summary: itemSummaryParts.join(', ') }
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    next(error);
  }
}

async function updateAdminOrderItem(req, res, next) {
  try {
    const { id, itemId } = req.params;
    const { admin_unit_price, qty_approved, qty_ordered } = req.body;

    const items = await query('SELECT * FROM order_items WHERE id = ? AND order_id = ?', [itemId, id]);
    if (!items || items.length === 0) return res.status(404).json({ success: false, message: 'Order item not found' });
    const item = items[0];
    const orders = await query('SELECT placed_by_role, status, shipping_cost FROM orders WHERE id = ?', [id]);
    if (orders.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });
    if (orders[0].placed_by_role !== 'retailer' || orders[0].status !== 'pending_approval') {
      return res.status(409).json({ success: false, message: 'Only pending retailer orders can be edited.' });
    }

    let newPrice = item.admin_unit_price !== null && item.admin_unit_price !== undefined ? parseFloat(item.admin_unit_price) : parseFloat(item.unit_price);
    if (admin_unit_price !== undefined && admin_unit_price !== null && !isNaN(parseFloat(admin_unit_price))) {
      newPrice = parseFloat(admin_unit_price);
    }
    if (!Number.isFinite(newPrice) || newPrice < 0) {
      return res.status(400).json({ success: false, message: 'A non-negative unit price is required' });
    }

    let newQtyApproved = item.qty_approved !== null && item.qty_approved !== undefined ? parseInt(item.qty_approved, 10) : parseInt(item.qty_ordered, 10);
    if (qty_approved !== undefined && qty_approved !== null && !isNaN(parseInt(qty_approved, 10))) {
      newQtyApproved = Math.max(0, parseInt(qty_approved, 10));
    }

    let newQtyOrdered = item.qty_ordered;
    if (qty_ordered !== undefined && qty_ordered !== null && !isNaN(parseInt(qty_ordered, 10))) {
      newQtyOrdered = Math.max(1, parseInt(qty_ordered, 10));
    }
    if (newQtyApproved > newQtyOrdered) {
      return res.status(400).json({ success: false, message: 'Approved quantity cannot exceed ordered quantity' });
    }

    let itemStatus = item.status;
    if (newQtyApproved === 0) {
      itemStatus = 'rejected';
    } else if (newQtyApproved < newQtyOrdered) {
      itemStatus = 'partially_approved';
    } else {
      itemStatus = 'approved';
    }

    const newLineTotal = newPrice * newQtyApproved;

    const previouslyReserved = item.qty_approved !== null && item.qty_approved !== undefined
      ? parseInt(item.qty_approved, 10)
      : parseInt(item.qty_ordered, 10);
    if (newQtyApproved < previouslyReserved) {
      const released = previouslyReserved - newQtyApproved;
      if (item.variant_id) {
        await query('UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?', [released, item.variant_id]);
      } else {
        await query('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?', [released, item.product_id]);
      }
    }

    await query(
      `UPDATE order_items 
       SET admin_unit_price = ?, qty_ordered = ?, qty_approved = ?, line_total = ?, status = ?
       WHERE id = ? AND order_id = ?`,
      [newPrice, newQtyOrdered, newQtyApproved, newLineTotal, itemStatus, itemId, id]
    );

    // Recalculate overall order subtotal and grand_total
    const allItems = await query('SELECT line_total FROM order_items WHERE order_id = ? AND status != "rejected"', [id]);
    const newSubtotal = allItems.reduce((sum, i) => sum + parseFloat(i.line_total || 0), 0);
    const shippingCost = parseFloat(orders[0]?.shipping_cost || 0);
    const newGrandTotal = newSubtotal + shippingCost;

    await query('UPDATE orders SET subtotal = ?, discount_amount = 0, coupon_code = NULL, coupon_discount = 0, grand_total = ? WHERE id = ?', [newSubtotal, newGrandTotal, id]);

    res.json({
      success: true,
      message: 'Order item price and quantity updated successfully',
      data: {
        item_id: parseInt(itemId, 10),
        admin_unit_price: newPrice,
        qty_approved: newQtyApproved,
        line_total: newLineTotal,
        subtotal: newSubtotal,
        grand_total: newGrandTotal
      }
    });
  } catch (error) {
    next(error);
  }
}

async function editAdminUnitPrice(req, res, next) {
  return updateAdminOrderItem(req, res, next);
}

module.exports = {
  listPendingResellerOrders,
  approveResellerOrder,
  editAdminUnitPrice,
  updateAdminOrderItem
};
