const db = require('../../config/db');
const bus = require('../../events/bus');
const { bumpOrdersVersion } = require('../../cache/orderCache');
const { getOrSetShippingCache, bumpShippingVersion } = require('../../cache/shippingCache');

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
   * List active shipping presets (cached)
   */
  async getActivePresets() {
    return getOrSetShippingCache('active_presets', async () => {
      const presets = await db.query(
        `SELECT * FROM shipping_presets WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`
      );
      return presets || [];
    });
  }

  /**
   * Builds/returns a cached shipping rule context containing settings and
   * a pincode -> preset lookup index for O(1) resolution.
   */
  async _getShippingQuoteContext() {
    return getOrSetShippingCache('quote_context', async () => {
      const [settings, activePresets] = await Promise.all([
        db.query(
          "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('global_shipping_fee', 'shipping_cost_default', 'shipping_applies_to', 'free_shipping_threshold')"
        ),
        db.query(
          'SELECT * FROM shipping_presets WHERE is_active = 1 ORDER BY sort_order ASC, id DESC'
        )
      ]);

      const values = Object.fromEntries((settings || []).map((row) => [row.setting_key, row.setting_value]));
      const presetMap = {};
      for (const p of (activePresets || [])) {
        const pin = String(p.label || '').trim();
        if (pin && !Object.prototype.hasOwnProperty.call(presetMap, pin)) {
          presetMap[pin] = p;
        }
      }

      return { values, presetMap };
    });
  }

  async getQuote({ pinCode = null, subtotal = 0, userRole = 'customer' } = {}) {
    const { values, presetMap } = await this._getShippingQuoteContext();
    const appliesTo = values.shipping_applies_to || 'customer_only';
    const fallbackCost = parseFloat(values.global_shipping_fee ?? values.shipping_cost_default ?? '50') || 0;
    const freeThreshold = parseFloat(values.free_shipping_threshold || '0') || 0;

    if (userRole === 'retailer' && appliesTo === 'customer_only') {
      return { id: 'retailer-free', label: 'Retailer Shipping', cost: 0, estimated_days: 'To be confirmed', source: 'retailer_scope', free_shipping_threshold: freeThreshold };
    }
    if (freeThreshold > 0 && parseFloat(subtotal || 0) >= freeThreshold) {
      return { id: 'free-threshold', label: 'Free Shipping', cost: 0, estimated_days: 'Standard delivery', source: 'free_threshold', free_shipping_threshold: freeThreshold };
    }

    if (pinCode) {
      const normalizedPin = String(pinCode).trim();
      const matched = Object.prototype.hasOwnProperty.call(presetMap, normalizedPin)
        ? presetMap[normalizedPin]
        : null;
      if (matched) {
        return { ...matched, source: 'pincode', free_shipping_threshold: freeThreshold };
      }
    }

    return {
      id: 'fallback',
      label: 'Standard Shipping',
      cost: fallbackCost,
      estimated_days: 'Standard delivery',
      source: 'fallback',
      free_shipping_threshold: freeThreshold
    };
  }

  async getShippingOptions({ pinCode = null, subtotal = 0, userRole = 'customer' } = {}) {
    // Presets are pincode-specific pricing rules, not selectable methods.
    // Until a pincode is known, return the configured fallback quote.
    return [await this.getQuote({ pinCode, subtotal, userRole })];
  }

  /**
   * Admin: List all presets (two-tier cached)
   */
  async adminListPresets() {
    return getOrSetShippingCache('admin_presets', async () => {
      const presets = await db.query(`SELECT * FROM shipping_presets ORDER BY sort_order ASC, id ASC`);
      return presets || [];
    });
  }

  /**
   * Admin: Create preset
   */
  async adminCreatePreset(data) {
    const { label, description, cost, estimated_days, is_active, sort_order } = data;
    if (!/^\d{6}$/.test(String(label || '').trim())) {
      throw new Error('A valid 6-digit pincode is required.');
    }
    const parsedCost = Number(cost);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      throw new Error('Shipping cost must be a valid non-negative number.');
    }
    const result = await db.query(
      `INSERT INTO shipping_presets (label, description, cost, estimated_days, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [String(label).trim(), description || null, parsedCost, estimated_days || null, is_active !== undefined ? (is_active ? 1 : 0) : 1, sort_order || 0]
    );

    await bumpShippingVersion();
    const presets = await db.query('SELECT * FROM shipping_presets WHERE id = ?', [result.insertId]);
    return presets[0];
  }

  /**
   * Admin: Update preset
   */
  async adminUpdatePreset(id, data) {
    const { label, description, cost, estimated_days, is_active, sort_order } = data;
    if (label !== undefined && !/^\d{6}$/.test(String(label).trim())) {
      throw new Error('A valid 6-digit pincode is required.');
    }
    if (cost !== undefined && (!Number.isFinite(Number(cost)) || Number(cost) < 0)) {
      throw new Error('Shipping cost must be a valid non-negative number.');
    }
    await db.query(
      `UPDATE shipping_presets 
       SET label = COALESCE(?, label),
           description = COALESCE(?, description),
           cost = COALESCE(?, cost),
           estimated_days = COALESCE(?, estimated_days),
           is_active = COALESCE(?, is_active),
           sort_order = COALESCE(?, sort_order)
       WHERE id = ?`,
      [label !== undefined ? String(label).trim() : undefined, description, cost !== undefined ? Number(cost) : null, estimated_days, is_active !== undefined ? (is_active ? 1 : 0) : undefined, sort_order, id]
    );

    await bumpShippingVersion();
    const presets = await db.query('SELECT * FROM shipping_presets WHERE id = ?', [id]);
    return presets[0] || null;
  }

  /**
   * Admin: Delete preset
   */
  async adminDeletePreset(id) {
    await db.query('DELETE FROM shipping_presets WHERE id = ?', [id]);
    await bumpShippingVersion();
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

    const [orders, allOrderItems] = await Promise.all([
      db.query('SELECT * FROM orders WHERE id = ?', [orderId]),
      db.query('SELECT * FROM order_items WHERE order_id = ?', [orderId])
    ]);
    if (!orders || orders.length === 0) {
      throw new Error('Order not found.');
    }

    // Build O(1) lookup Map for order items
    const itemById = new Map(allOrderItems.map((item) => [String(item.id), item]));
    const normalizedItems = [];

    for (const itemInput of items) {
      const order_item_id = itemInput.order_item_id || itemInput.id;
      const qty = itemInput.qty !== undefined && itemInput.qty !== null
        ? parseInt(itemInput.qty, 10)
        : (itemInput.qty_shipped !== undefined && itemInput.qty_shipped !== null ? parseInt(itemInput.qty_shipped, 10) : 1);

      const item = itemById.get(String(order_item_id));
      if (!item) {
        throw new Error(`Order item #${order_item_id} does not belong to order #${orderId}`);
      }

      if (item.status === 'rejected') {
        throw new Error(`Item #${order_item_id} (${item.product_name || item.title}) was rejected and cannot be shipped.`);
      }

      const acceptedQty = item.qty_approved !== null && item.qty_approved !== undefined ? item.qty_approved : (item.qty_ordered || item.qty || 1);
      const alreadyShipped = item.qty_shipped || 0;
      const remainingUnshipped = acceptedQty - alreadyShipped;

      if (qty > remainingUnshipped) {
        throw new Error(`Cannot ship ${qty} units of item #${order_item_id}. Only ${remainingUnshipped} accepted units remaining unshipped.`);
      }
      normalizedItems.push({ order_item_id, qty });
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

    // Bulk-insert shipment_items + update order_items in parallel
    const shipmentValuesSql = normalizedItems.map(() => '(?, ?, ?)').join(', ');
    const shipmentValuesParams = normalizedItems.flatMap((it) => [shipmentId, it.order_item_id, it.qty]);

    await Promise.all([
      db.query(
        `INSERT INTO shipment_items (shipment_id, order_item_id, qty) VALUES ${shipmentValuesSql}`,
        shipmentValuesParams
      ),
      ...normalizedItems.map((it) =>
        db.query('UPDATE order_items SET qty_shipped = qty_shipped + ? WHERE id = ?', [it.qty, it.order_item_id])
      )
    ]);

    // Recompute order shipment status and invalidate orders cache
    const updatedOrderStatus = await this.computeOrderShipmentStatus(orderId);
    await bumpOrdersVersion();

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

    await bumpOrdersVersion();
    const shipments = await db.query('SELECT * FROM shipments WHERE id = ?', [shipmentId]);
    return shipments[0] || null;
  }

  /**
   * Get shipments for an order (single parallel batch + O(M) Hash Map grouping)
   */
  async getOrderShipments(orderId) {
    const [shipments, allShipmentItems, rejectedItems] = await Promise.all([
      db.query('SELECT * FROM shipments WHERE order_id = ? ORDER BY id ASC', [orderId]),
      db.query(
        `SELECT si.*, oi.product_name, oi.sku, oi.unit_price AS price
         FROM shipment_items si
         INNER JOIN shipments s ON si.shipment_id = s.id
         INNER JOIN order_items oi ON si.order_item_id = oi.id
         WHERE s.order_id = ?
         ORDER BY si.id ASC`,
        [orderId]
      ),
      db.query(
        `SELECT * FROM order_items WHERE order_id = ? AND status = 'rejected'`,
        [orderId]
      )
    ]);

    const itemsByShipment = new Map();
    for (const si of (allShipmentItems || [])) {
      let list = itemsByShipment.get(si.shipment_id);
      if (!list) {
        list = [];
        itemsByShipment.set(si.shipment_id, list);
      }
      list.push(si);
    }

    for (const s of (shipments || [])) {
      s.items = itemsByShipment.get(s.id) || [];
    }

    return {
      shipments: shipments || [],
      unfulfilled_rejected_items: rejectedItems || []
    };
  }
}

module.exports = new ShippingService();
