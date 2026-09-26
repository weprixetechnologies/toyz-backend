function generateProformaHtml(order, items, settings = {}) {
  const storeName = settings.store_name || 'WePrixe Store';
  const storeEmail = settings.store_email || 'support@weprixe.com';
  const currency = settings.currency_symbol || '₹';

  const dateStr = new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

  // Exclude rejected items (qty_approved == 0)
  const approvedItems = items.filter((item) => item.status !== 'rejected' && (item.qty_approved === null || item.qty_approved > 0));

  let subtotal = 0;
  const itemRows = approvedItems.map((item, idx) => {
    const qty = item.qty_approved !== null ? item.qty_approved : item.qty_ordered;
    const price = item.admin_unit_price !== null ? parseFloat(item.admin_unit_price) : parseFloat(item.unit_price);
    const total = price * qty;
    subtotal += total;

    return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${idx + 1}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">
          <strong>${item.product_name}</strong>
          ${item.variant_label ? `<br><small style="color: #666;">Variant: ${item.variant_label}</small>` : ''}
          ${item.sku ? `<br><small style="color: #888;">SKU: ${item.sku}</small>` : ''}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${qty}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">${currency}${price.toFixed(2)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">${currency}${total.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>PROFORMA INVOICE - ${order.order_number}</title>
    <style>
      body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 0; padding: 20px; }
      .header { display: flex; justify-content: space-between; border-bottom: 2px solid #ea580c; padding-bottom: 15px; }
      .title { font-size: 24px; font-weight: bold; color: #ea580c; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th { background: #fff7ed; padding: 10px; text-align: left; font-size: 13px; text-transform: uppercase; border-bottom: 2px solid #ea580c; }
      .totals { width: 40%; margin-left: auto; margin-top: 20px; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <div class="title">${storeName}</div>
        <div>Email: ${storeEmail}</div>
      </div>
      <div style="text-align: right;">
        <h2 style="color: #ea580c; margin: 0;">PROFORMA INVOICE</h2>
        <div><strong>Order #:</strong> ${order.order_number}</div>
        <div><strong>Date:</strong> ${dateStr}</div>
        <div><strong>Status:</strong> ${order.status.toUpperCase()}</div>
      </div>
    </div>

    <div style="margin-top: 20px;">
      <h4>Reseller Billed To:</h4>
      <div><strong>${order.billing_name || order.shipping_name || 'Reseller'}</strong></div>
      <div>Phone: ${order.shipping_phone || 'N/A'}</div>
      <div>${order.shipping_line1}, ${order.shipping_city}, ${order.shipping_state} - ${order.shipping_pin}</div>
      ${order.billing_gstin ? `<div><strong>GSTIN:</strong> ${order.billing_gstin}</div>` : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Approved Product / Variant</th>
          <th style="text-align: center;">Approved Qty</th>
          <th style="text-align: right;">Wholesale Price</th>
          <th style="text-align: right;">Approved Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="totals">
      <table>
        <tr style="font-weight: bold; font-size: 16px;">
          <td>Proforma Payable Total:</td>
          <td style="text-align: right; color: #ea580c;">${currency}${subtotal.toFixed(2)}</td>
        </tr>
      </table>
    </div>
  </body>
  </html>
  `;
}

module.exports = {
  generateProformaHtml
};
