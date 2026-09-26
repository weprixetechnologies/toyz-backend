function generateInvoiceHtml(order, items, settings = {}) {
  const storeName = settings.store_name || 'WePrixe Store';
  const storeEmail = settings.store_email || 'support@weprixe.com';
  const currency = settings.currency_symbol || '₹';

  const dateStr = new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

  const itemRows = items.map((item, idx) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">${idx + 1}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd;">
        <strong>${item.product_name}</strong>
        ${item.variant_label ? `<br><small style="color: #666;">Variant: ${item.variant_label}</small>` : ''}
        ${item.sku ? `<br><small style="color: #888;">SKU: ${item.sku}</small>` : ''}
      </td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.qty_ordered}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${currency}${parseFloat(item.unit_price).toFixed(2)}</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${item.tax_rate}%</td>
      <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${currency}${parseFloat(item.line_total).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>TAX INVOICE - ${order.order_number}</title>
    <style>
      body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 0; padding: 20px; }
      .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 15px; }
      .title { font-size: 24px; font-weight: bold; color: #2563eb; }
      .meta { text-align: right; }
      .section { margin-top: 20px; display: flex; justify-content: space-between; }
      .box { width: 48%; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th { background: #f3f4f6; padding: 10px; text-align: left; font-size: 13px; text-transform: uppercase; }
      .totals { width: 40%; margin-left: auto; margin-top: 20px; }
      .totals table td { padding: 6px; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <div class="title">${storeName}</div>
        <div>Email: ${storeEmail}</div>
      </div>
      <div class="meta">
        <h2>TAX INVOICE</h2>
        <div><strong>Order #:</strong> ${order.order_number}</div>
        <div><strong>Date:</strong> ${dateStr}</div>
        <div><strong>Payment Method:</strong> ${order.payment_method ? order.payment_method.toUpperCase() : 'COD'}</div>
      </div>
    </div>

    <div class="section">
      <div class="box">
        <h4>Billed & Shipped To:</h4>
        <div><strong>${order.shipping_name || 'Customer'}</strong></div>
        <div>Phone: ${order.shipping_phone || 'N/A'}</div>
        <div>${order.shipping_line1}</div>
        ${order.shipping_line2 ? `<div>${order.shipping_line2}</div>` : ''}
        <div>${order.shipping_city}, ${order.shipping_state} - ${order.shipping_pin}</div>
        <div>${order.shipping_country || 'India'}</div>
        ${order.billing_gstin ? `<div><strong>GSTIN:</strong> ${order.billing_gstin}</div>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Item Description</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Unit Price</th>
          <th style="text-align: right;">Tax Rate</th>
          <th style="text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="totals">
      <table>
        <tr><td>Subtotal:</td><td style="text-align: right;">${currency}${parseFloat(order.subtotal).toFixed(2)}</td></tr>
        ${parseFloat(order.discount_amount || 0) > 0 ? `<tr><td>Discount:</td><td style="text-align: right;">-${currency}${parseFloat(order.discount_amount).toFixed(2)}</td></tr>` : ''}
        <tr><td>Shipping Fee:</td><td style="text-align: right;">${currency}${parseFloat(order.shipping_cost || 0).toFixed(2)}</td></tr>
        <tr style="font-weight: bold; border-top: 2px solid #333; font-size: 16px;">
          <td>Grand Total:</td>
          <td style="text-align: right; color: #2563eb;">${currency}${parseFloat(order.grand_total).toFixed(2)}</td>
        </tr>
      </table>
    </div>
  </body>
  </html>
  `;
}

function generatePackingSlipHtml(order, items, settings = {}) {
  const storeName = settings.store_name || 'WePrixe Store';
  const dateStr = new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

  const itemRows = items.map((item, idx) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #ddd;">${idx + 1}</td>
      <td style="padding: 10px; border-bottom: 1px solid #ddd;">
        <strong>${item.product_name}</strong>
        ${item.variant_label ? `<br><small style="color: #666;">Variant: ${item.variant_label}</small>` : ''}
        ${item.sku ? `<br><small style="color: #888;">SKU: ${item.sku}</small>` : ''}
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center; font-size: 16px; font-weight: bold;">${item.qty_ordered}</td>
      <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">[ &nbsp; ] Checked</td>
    </tr>
  `).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>PACKING SLIP - ${order.order_number}</title>
    <style>
      body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 0; padding: 20px; }
      .header { border-bottom: 2px solid #000; padding-bottom: 15px; display: flex; justify-content: space-between; }
      .title { font-size: 24px; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th { background: #e5e7eb; padding: 10px; text-align: left; font-size: 13px; text-transform: uppercase; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <div class="title">${storeName}</div>
        <div>FULFILLMENT PACKING SLIP</div>
      </div>
      <div style="text-align: right;">
        <div><strong>Order #:</strong> ${order.order_number}</div>
        <div><strong>Date:</strong> ${dateStr}</div>
      </div>
    </div>

    <div style="margin-top: 20px;">
      <h4>Ship To:</h4>
      <div><strong>${order.shipping_name || 'Customer'}</strong></div>
      <div>Phone: ${order.shipping_phone || 'N/A'}</div>
      <div>${order.shipping_line1}</div>
      ${order.shipping_line2 ? `<div>${order.shipping_line2}</div>` : ''}
      <div>${order.shipping_city}, ${order.shipping_state} - ${order.shipping_pin}</div>
      <div>${order.shipping_country || 'India'}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Item Description</th>
          <th style="text-align: center;">Quantity</th>
          <th style="text-align: center;">Verification</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
  </body>
  </html>
  `;
}

module.exports = {
  generateInvoiceHtml,
  generatePackingSlipHtml
};
