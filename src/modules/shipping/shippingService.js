const db = require('../../config/db');
const bus = require('../../events/bus');

class ShippingService {
  /**
   * Compute order shipment status strictly on accepted items per §6.3
   */
  async computeOrderShipmentStatus(orderId) {
    const orders = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!orders || orders.length === 0) return null;
    const order = orders[0];

    // Fetch accepted items: status IN ('approved', 'partially_approved') AND qty_approved > 0
    const acceptedItems = await db.query(
      `SELECT * FROM order_items 
       WHERE order_id = ? 
         AND status IN ('approved', 'partially_approved') 
         AND qty_approved > 0`,
      [orderId]
    );

    let itemsToEvaluate = acceptedItems || [];
    if (!acceptedItems || acceptedItems.length === 0) {
      // Check if this is a standard order where status on items is 'approved' or 'pending'
      const allItems = await db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
      if (allItems && allItems.length > 0) {
        const nonRejected = allItems.filter(i => i.status !== 'rejected');
        if (nonRejected.length > 0) {
          itemsToEvaluate = nonRejected.map(i => ({
            ...i,
            qty_approved: i.qty_approved !== null && i.qty_approved !== undefined ? i.qty_approved : (i.qty_ordered || i.qty || 1)
          }));
        }
      }
    }

    if (itemsToEvaluate.length === 0) {
      return order.status;
    }

    let totalAcceptedQty = 0;
    let totalShippedQty = 0;

    for (const item of itemsToEvaluate) {
      const appQty = item.qty_approved !== null && item.qty_approved !== undefined ? item.qty_approved : (item.qty_ordered || item.qty || 1);
      const shipQty = item.qty_shipped || 0;
      totalAcceptedQty += appQty;
      totalShippedQty += shipQty;
    }

    let newStatus = order.status;
    if (totalShippedQty === 0) {
      newStatus = 'processing';
    } else if (totalShippedQty < totalAcceptedQty) {
      newStatus = 'partially_shipped';
    } else {
      newStatus = 'shipped';
    }

    if (newStatus !== order.status) {
      await db.query('UPDATE orders SET status = ? WHERE id = ?', [newStatus, orderId]);
      if (newStatus === 'shipped') {
        bus.emit('order.shipped', { orderId });
      }
    }

    return newStatus;
  }

  /**
   * List active shipping presets
   */
  async getActivePresets() {
    const presets = await db.query(
      `SELECT * FROM shipping_presets WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`
    );
    return presets || [];
  }

  async getQuote({ pinCode = null, subtotal = 0, userRole = 'customer' } = {}) {
    const settings = await db.query(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('global_shipping_fee', 'shipping_cost_default', 'shipping_applies_to', 'free_shipping_threshold')"
    );
    const values = Object.fromEntries(settings.map(row => [row.setting_key, row.setting_value]));
    const appliesTo = values.shipping_applies_to || 'customer_only';
    const fallbackCost = parseFloat(values.global_shipping_fee ?? values.shipping_cost_default ?? '50') || 0;
    const freeThreshold = parseFloat(values.free_shipping_threshold || '0') || 0;

    if (userRole === 'retailer' && appliesTo === 'customer_only') {
      return { id: 'retailer-free', label: 'Retailer Shipping', cost: 0, estimated_days: 'To be confirmed', source: 'retailer_scope' };
    }
    if (freeThreshold > 0 && parseFloat(subtotal || 0) >= freeThreshold) {
      return { id: 'free-threshold', label: 'Free Shipping', cost: 0, estimated_days: 'Standard delivery', source: 'free_threshold' };
    }

    if (pinCode) {
      const presets = await db.query(
        'SELECT * FROM shipping_presets WHERE label = ? AND is_active = 1 ORDER BY sort_order ASC, id ASC LIMIT 1',
        [String(pinCode).trim()]
      );
      if (presets.length > 0) return { ...presets[0], source: 'pincode' };
    }

    return {
      id: 'fallback',
      label: 'Standard Shipping',
      cost: fallbackCost,
      estimated_days: 'Standard delivery',
      source: 'fallback'
    };
  }

  async getShippingOptions({ pinCode = null, subtotal = 0, userRole = 'customer' } = {}) {
    if (pinCode) return [await this.getQuote({ pinCode, subtotal, userRole })];
    const presets = await this.getActivePresets();
    return presets.length > 0 ? presets : [await this.getQuote({ subtotal, userRole })];
  }

  /**
   * Admin: List all presets
   */
  async adminListPresets() {
    const presets = await db.query(`SELECT * FROM shipping_presets ORDER BY sort_order ASC, id ASC`);
    return presets || [];
  }

  /**
   * Admin: Create preset
   */
  async adminCreatePreset(data) {
    const { label, description, cost, estimated_days, is_active, sort_order } = data;
    if (!label || cost === undefined) {
      throw new Error('Label and cost are required.');
    }
    const result = await db.query(
      `INSERT INTO shipping_presets (label, description, cost, estimated_days, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [label, description || null, parseFloat(cost), estimated_days || null, is_active !== undefined ? is_active : 1, sort_order || 0]
    );

    const presets = await db.query('SELECT * FROM shipping_presets WHERE id = ?', [result.insertId]);
    return presets[0];
  }

  /**
   * Admin: Update preset
   */
  async adminUpdatePreset(id, data) {
    const { label, description, cost, estimated_days, is_active, sort_order } = data;
    await db.query(
      `UPDATE shipping_presets 
       SET label = COALESCE(?, label),
           description = COALESCE(?, description),
           cost = COALESCE(?, cost),
           estimated_days = COALESCE(?, estimated_days),
           is_active = COALESCE(?, is_active),
           sort_order = COALESCE(?, sort_order)
       WHERE id = ?`,
      [label, description, cost !== undefined ? parseFloat(cost) : null, estimated_days, is_active, sort_order, id]
    );

    const presets = await db.query('SELECT * FROM shipping_presets WHERE id = ?', [id]);
    return presets[0] || null;
  }

  /**
   * Admin: Delete preset
   */
  async adminDeletePreset(id) {
    await db.query('DELETE FROM shipping_presets WHERE id = ?', [id]);
    return { id, deleted: true };
  }

  /**
   * Admin: Create split shipment
   */
  async createShipment(orderId, { carrier, tracking_carrier, tracking_number, items }) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('At least one item must be included in the shipment.');
    }

    const carrierName = carrier || tracking_carrier || 'Standard Courier';

    const orders = await db.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!orders || orders.length === 0) {
      throw new Error('Order not found.');
    }

    for (const itemInput of items) {
      const order_item_id = itemInput.order_item_id || itemInput.id;
      const qty = itemInput.qty !== undefined && itemInput.qty !== null
        ? parseInt(itemInput.qty, 10)
        : (itemInput.qty_shipped !== undefined && itemInput.qty_shipped !== null ? parseInt(itemInput.qty_shipped, 10) : 1);

      const orderItems = await db.query('SELECT * FROM order_items WHERE id = ? AND order_id = ?', [order_item_id, orderId]);
      if (!orderItems || orderItems.length === 0) {
        throw new Error(`Order item #${order_item_id} does not belong to order #${orderId}`);
      }

      const item = orderItems[0];
      if (item.status === 'rejected') {
        throw new Error(`Item #${order_item_id} (${item.product_name || item.title}) was rejected and cannot be shipped.`);
      }

      const acceptedQty = item.qty_approved !== null && item.qty_approved !== undefined ? item.qty_approved : (item.qty_ordered || item.qty || 1);
      const alreadyShipped = item.qty_shipped || 0;
      const remainingUnshipped = acceptedQty - alreadyShipped;

      if (qty > remainingUnshipped) {
        throw new Error(`Cannot ship ${qty} units of item #${order_item_id}. Only ${remainingUnshipped} accepted units remaining unshipped.`);
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const shipmentNumber = `SHP-${dateStr}-${randomSuffix}`;

    // Insert shipment record
    const shipmentResult = await db.query(
      `INSERT INTO shipments (shipment_number, order_id, carrier, tracking_number, status, shipped_at)
       VALUES (?, ?, ?, ?, 'shipped', NOW())`,
      [shipmentNumber, orderId, carrierName, tracking_number || 'N/A']
    );

    const shipmentId = shipmentResult.insertId;

    // Process each item
    for (const itemInput of items) {
      const order_item_id = itemInput.order_item_id || itemInput.id;
      const qty = itemInput.qty !== undefined && itemInput.qty !== null
        ? parseInt(itemInput.qty, 10)
        : (itemInput.qty_shipped !== undefined && itemInput.qty_shipped !== null ? parseInt(itemInput.qty_shipped, 10) : 1);

      await db.query(
        `INSERT INTO shipment_items (shipment_id, order_item_id, qty)
         VALUES (?, ?, ?)`,
        [shipmentId, order_item_id, qty]
      );

      await db.query(
        `UPDATE order_items SET qty_shipped = qty_shipped + ? WHERE id = ?`,
        [qty, order_item_id]
      );
    }

    // Recompute order shipment status
    const updatedOrderStatus = await this.computeOrderShipmentStatus(orderId);

    const shipments = await db.query('SELECT * FROM shipments WHERE id = ?', [shipmentId]);
    const shipmentItems = await db.query(
      `SELECT si.*, oi.product_name, oi.sku 
       FROM shipment_items si
       JOIN order_items oi ON si.order_item_id = oi.id
       WHERE si.shipment_id = ?`,
      [shipmentId]
    );

    return {
      shipment: shipments[0],
      items: shipmentItems,
      order_status: updatedOrderStatus
    };
  }

  /**
   * Admin: Update shipment tracking info
   */
  async updateShipment(shipmentId, { carrier, tracking_number, status }) {
    await db.query(
      `UPDATE shipments 
       SET carrier = COALESCE(?, carrier),
           tracking_number = COALESCE(?, tracking_number),
           status = COALESCE(?, status)
       WHERE id = ?`,
      [carrier, tracking_number, status, shipmentId]
    );

    const shipments = await db.query('SELECT * FROM shipments WHERE id = ?', [shipmentId]);
    return shipments[0] || null;
  }

  /**
   * Get shipments for an order
   */
  async getOrderShipments(orderId) {
    const shipments = await db.query('SELECT * FROM shipments WHERE order_id = ? ORDER BY id ASC', [orderId]);
    for (const s of (shipments || [])) {
      const sItems = await db.query(
        `SELECT si.*, oi.product_name, oi.sku, oi.unit_price AS price
         FROM shipment_items si
         JOIN order_items oi ON si.order_item_id = oi.id
         WHERE si.shipment_id = ?`,
        [s.id]
      );
      s.items = sItems || [];
    }

    const rejectedItems = await db.query(
      `SELECT * FROM order_items WHERE order_id = ? AND status = 'rejected'`,
      [orderId]
    );

    return {
      shipments: shipments || [],
      unfulfilled_rejected_items: rejectedItems || []
    };
  }
}

module.exports = new ShippingService();
