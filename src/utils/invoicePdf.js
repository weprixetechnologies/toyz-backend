const PDFDocument = require('pdfkit');

async function fetchImageBuffer(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (_) {
    return null;
  }
}

/**
 * Generate commercial-grade GST Tax Invoice PDF via PDFKit
 */
async function generateInvoicePdf(order, items = [], storeBrand = {}) {
  const logoBuffer = await fetchImageBuffer(storeBrand.logo_url);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 36,
      size: 'A4',
      info: {
        Title: `Tax Invoice - ${order.order_number}`,
        Author: storeBrand.store_name || 'Provoke Playtech',
        Subject: `Tax Invoice for Order #${order.order_number}`
      }
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = 595.28;
    const margin = 36;
    const contentWidth = pageWidth - margin * 2; // 523.28 pt

    // ── 1. Header (Brand Info on Left, Invoice Details on Right) ─────────────
    let leftY = 36;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, margin, leftY, { fit: [140, 40] });
        leftY += 44;
      } catch (_) {
        // Fallback to text logo if image format unreadable
        doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text(storeBrand.store_name || 'Provoke Playtech', margin, leftY);
        leftY += 20;
      }
    } else {
      doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text(storeBrand.store_name || 'Provoke Playtech', margin, leftY);
      leftY += 20;
    }

    if (storeBrand.store_tagline) {
      doc.fillColor('#64748b').fontSize(8).font('Helvetica-Oblique').text(storeBrand.store_tagline, margin, leftY);
      leftY += 12;
    }

    doc.fillColor('#475569').fontSize(8).font('Helvetica');
    if (storeBrand.address_line1 || storeBrand.address_line2) {
      const addrLine = [storeBrand.address_line1, storeBrand.address_line2].filter(Boolean).join(', ');
      doc.text(addrLine, margin, leftY);
      leftY += 11;
    }

    const cityStatePin = [storeBrand.city, storeBrand.state ? `${storeBrand.state} - ${storeBrand.pin_code || ''}` : storeBrand.pin_code, storeBrand.country || 'India'].filter(Boolean).join(', ');
    if (cityStatePin) {
      doc.text(cityStatePin, margin, leftY);
      leftY += 11;
    }

    if (storeBrand.gstin) {
      doc.font('Helvetica-Bold').text(`GSTIN: ${storeBrand.gstin}`, margin, leftY);
      leftY += 11;
    }

    const contactLine = [storeBrand.email ? `Email: ${storeBrand.email}` : '', storeBrand.phone ? `Phone: ${storeBrand.phone}` : ''].filter(Boolean).join(' | ');
    if (contactLine) {
      doc.font('Helvetica').text(contactLine, margin, leftY);
      leftY += 11;
    }

    // Top Right Header: Invoice Metadata Box
    const rightBoxWidth = 200;
    const rightBoxX = pageWidth - margin - rightBoxWidth;
    let rightY = 36;

    doc.fillColor('#1e40af').fontSize(20).font('Helvetica-Bold').text('TAX INVOICE', rightBoxX, rightY, { width: rightBoxWidth, align: 'right' });
    rightY += 24;

    doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text(`Invoice #: ${order.order_number}`, rightBoxX, rightY, { width: rightBoxWidth, align: 'right' });
    rightY += 13;

    const invoiceDate = new Date(order.created_at || Date.now()).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    doc.fillColor('#475569').fontSize(8).font('Helvetica').text(`Date: ${invoiceDate}`, rightBoxX, rightY, { width: rightBoxWidth, align: 'right' });
    rightY += 12;

    const payMethod = (order.payment_method || (order.is_cod ? 'COD' : 'ONLINE')).toUpperCase();
    doc.text(`Payment Mode: ${payMethod}`, rightBoxX, rightY, { width: rightBoxWidth, align: 'right' });
    rightY += 12;

    const payStatus = (order.payment_status || 'PENDING').toUpperCase();
    doc.font('Helvetica-Bold').fillColor(payStatus === 'PAID' ? '#166534' : '#b45309')
       .text(`Payment Status: ${payStatus}`, rightBoxX, rightY, { width: rightBoxWidth, align: 'right' });
    rightY += 12;

    if (order.payment_ref) {
      doc.font('Helvetica').fillColor('#64748b').text(`Txn Ref: ${order.payment_ref}`, rightBoxX, rightY, { width: rightBoxWidth, align: 'right' });
      rightY += 12;
    }

    // Divider Line
    const headerBottomY = Math.max(leftY, rightY) + 8;
    doc.moveTo(margin, headerBottomY).lineTo(pageWidth - margin, headerBottomY).strokeColor('#e2e8f0').lineWidth(1).stroke();

    // ── 2. Billing & Shipping Address Box ────────────────────────────────────
    let addressY = headerBottomY + 12;

    // Background Card for Addresses
    const addrBoxHeight = 85;
    doc.roundedRect(margin, addressY, contentWidth, addrBoxHeight, 6).fillColor('#f8fafc').fill();
    doc.roundedRect(margin, addressY, contentWidth, addrBoxHeight, 6).strokeColor('#e2e8f0').lineWidth(0.75).stroke();

    const colWidth = (contentWidth - 24) / 2;

    // Left Column: Billed & Shipped To
    let bY = addressY + 8;
    doc.fillColor('#1e40af').fontSize(8.5).font('Helvetica-Bold').text('BILLED & SHIPPED TO:', margin + 12, bY);
    bY += 12;

    const customerName = order.shipping_name || order.billing_name || 'Valued Customer';
    doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text(customerName, margin + 12, bY);
    bY += 12;

    doc.fillColor('#475569').fontSize(8).font('Helvetica');
    if (order.shipping_phone) {
      doc.text(`Phone: ${order.shipping_phone}`, margin + 12, bY);
      bY += 11;
    }

    const shippingLines = [order.shipping_line1, order.shipping_line2].filter(Boolean).join(', ');
    if (shippingLines) {
      doc.text(shippingLines, margin + 12, bY, { width: colWidth });
      bY += 11;
    }

    const shipLocation = [order.shipping_city, order.shipping_state ? `${order.shipping_state} - ${order.shipping_pin}` : order.shipping_pin, order.shipping_country || 'India'].filter(Boolean).join(', ');
    doc.text(shipLocation, margin + 12, bY, { width: colWidth });

    // Right Column: Additional Order & Customer Tax Details
    let rY = addressY + 8;
    doc.fillColor('#1e40af').fontSize(8.5).font('Helvetica-Bold').text('ORDER & CUSTOMER TAX INFO:', margin + colWidth + 24, rY);
    rY += 12;

    doc.fillColor('#475569').fontSize(8).font('Helvetica');
    if (order.billing_gstin) {
      doc.font('Helvetica-Bold').fillColor('#0f172a').text(`Customer GSTIN: ${order.billing_gstin.toUpperCase()}`, margin + colWidth + 24, rY);
      rY += 12;
      doc.font('Helvetica').fillColor('#475569');
    }

    doc.text(`Customer Account Role: ${(order.placed_by_role || 'Customer').toUpperCase()}`, margin + colWidth + 24, rY);
    rY += 11;

    doc.text(`Place of Supply: ${order.shipping_state || storeBrand.state || 'India'}`, margin + colWidth + 24, rY);
    rY += 11;

    if (order.paid_at) {
      doc.text(`Paid At: ${new Date(order.paid_at).toLocaleString('en-IN')}`, margin + colWidth + 24, rY);
      rY += 11;
    }

    // ── 3. Line Items Table ──────────────────────────────────────────────────
    let tableY = addressY + addrBoxHeight + 14;

    const colX = {
      sr: margin,
      desc: margin + 24,
      qty: margin + 280,
      price: margin + 335,
      tax: margin + 405,
      total: margin + 455
    };

    const colW = {
      sr: 24,
      desc: 256,
      qty: 55,
      price: 70,
      tax: 50,
      total: contentWidth - 455
    };

    // Table Header Row
    const tableHeaderHeight = 22;
    doc.rect(margin, tableY, contentWidth, tableHeaderHeight).fillColor('#0f172a').fill();

    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
    doc.text('#', colX.sr + 4, tableY + 6, { width: colW.sr - 8, align: 'center' });
    doc.text('ITEM DESCRIPTION', colX.desc + 4, tableY + 6, { width: colW.desc - 8 });
    doc.text('QTY', colX.qty, tableY + 6, { width: colW.qty, align: 'center' });
    doc.text('UNIT PRICE', colX.price, tableY + 6, { width: colW.price - 6, align: 'right' });
    doc.text('TAX', colX.tax, tableY + 6, { width: colW.tax - 4, align: 'right' });
    doc.text('AMOUNT', colX.total, tableY + 6, { width: colW.total - 8, align: 'right' });

    let currentY = tableY + tableHeaderHeight;

    const validItems = items.filter(
      (item) => item.status !== 'rejected' && (item.qty_approved === null || item.qty_approved > 0)
    );

    validItems.forEach((item, idx) => {
      const qty = item.qty_approved !== null && item.qty_approved !== undefined ? item.qty_approved : item.qty_ordered;
      const unitPrice = parseFloat(item.admin_unit_price !== null && item.admin_unit_price !== undefined ? item.admin_unit_price : item.unit_price);
      const taxRate = parseFloat(item.tax_rate || 0);
      const lineTotal = unitPrice * qty;

      const rowBg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      const itemRowHeight = item.variant_label || item.sku ? 28 : 22;

      doc.rect(margin, currentY, contentWidth, itemRowHeight).fillColor(rowBg).fill();
      doc.rect(margin, currentY, contentWidth, itemRowHeight).strokeColor('#f1f5f9').lineWidth(0.5).stroke();

      doc.fillColor('#64748b').fontSize(8).font('Helvetica')
         .text(String(idx + 1), colX.sr + 4, currentY + 5, { width: colW.sr - 8, align: 'center' });

      // Product Name & Variant/SKU
      doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold')
         .text(item.product_name, colX.desc + 4, currentY + 5, { width: colW.desc - 8, height: 11, ellipsis: true });

      if (item.variant_label || item.sku) {
        const subDetails = [item.variant_label ? `Variant: ${item.variant_label}` : '', item.sku ? `SKU: ${item.sku}` : ''].filter(Boolean).join(' | ');
        doc.fillColor('#64748b').fontSize(7).font('Helvetica')
           .text(subDetails, colX.desc + 4, currentY + 16, { width: colW.desc - 8, height: 9, ellipsis: true });
      }

      doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold')
         .text(String(qty), colX.qty, currentY + 5, { width: colW.qty, align: 'center' });

      doc.fillColor('#334155').fontSize(8).font('Helvetica')
         .text(`Rs. ${unitPrice.toFixed(2)}`, colX.price, currentY + 5, { width: colW.price - 6, align: 'right' });

      doc.fillColor('#64748b').fontSize(8).font('Helvetica')
         .text(`${taxRate > 0 ? `${taxRate}%` : '0%'}`, colX.tax, currentY + 5, { width: colW.tax - 4, align: 'right' });

      doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold')
         .text(`Rs. ${lineTotal.toFixed(2)}`, colX.total, currentY + 5, { width: colW.total - 8, align: 'right' });

      currentY += itemRowHeight;
    });

    // Outer table border
    doc.rect(margin, tableY, contentWidth, currentY - tableY).strokeColor('#cbd5e1').lineWidth(0.75).stroke();

    // ── 4. Financial Calculation Summary (Right Aligned) ────────────────────
    let summaryY = currentY + 12;
    const summaryBoxWidth = 220;
    const summaryX = pageWidth - margin - summaryBoxWidth;

    const subtotal = parseFloat(order.subtotal || 0);
    const discount = parseFloat(order.discount_amount || 0);
    const shipping = parseFloat(order.shipping_cost || 0);
    const grandTotal = parseFloat(order.grand_total || 0);

    // Summary Rows
    function renderSummaryRow(label, value, isBold = false, color = '#334155') {
      doc.fillColor(color).fontSize(8.5).font(isBold ? 'Helvetica-Bold' : 'Helvetica')
         .text(label, summaryX, summaryY, { width: 120, align: 'left' });
      doc.text(value, summaryX + 120, summaryY, { width: summaryBoxWidth - 120, align: 'right' });
      summaryY += 14;
    }

    renderSummaryRow('Items Subtotal:', `Rs. ${subtotal.toFixed(2)}`);

    if (discount > 0) {
      renderSummaryRow(`Discount (${order.coupon_code || 'Offer'}):`, `-Rs. ${discount.toFixed(2)}`, false, '#16a34a');
    }

    renderSummaryRow('Shipping & Handling:', shipping > 0 ? `Rs. ${shipping.toFixed(2)}` : 'FREE / Rs. 0.00');

    // Grand Total Highlight Banner
    summaryY += 2;
    doc.roundedRect(summaryX - 6, summaryY, summaryBoxWidth + 6, 26, 4).fillColor('#0f172a').fill();

    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
       .text('GRAND TOTAL:', summaryX, summaryY + 7, { width: 100, align: 'left' });
    doc.fillColor('#38bdf8').fontSize(11).font('Helvetica-Bold')
       .text(`Rs. ${grandTotal.toFixed(2)}`, summaryX + 90, summaryY + 7, { width: summaryBoxWidth - 96, align: 'right' });

    summaryY += 34;

    // ── 5. Configurable Invoice Footer & Terms & Conditions ─────────────────
    const footerY = Math.max(summaryY + 8, 720);

    doc.moveTo(margin, footerY).lineTo(pageWidth - margin, footerY).strokeColor('#e2e8f0').lineWidth(0.75).stroke();

    const footerText = storeBrand.invoice_footer ||
      'Thank you for shopping with us! For warranty, returns, or support, please contact customer care. All disputes are subject to local jurisdiction.';

    doc.fillColor('#475569').fontSize(7.5).font('Helvetica')
       .text(footerText, margin, footerY + 8, { width: contentWidth, align: 'center', lineGap: 2 });

    doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
       .text('This is a computer-generated tax invoice and requires no physical signature.', margin, footerY + 30, { width: contentWidth, align: 'center' });

    doc.end();
  });
}

/**
 * Generate Warehouse Packing Slip PDF via PDFKit
 */
async function generatePackingSlipPdf(order, items = [], storeBrand = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 36,
      size: 'A4',
      info: {
        Title: `Packing Slip - ${order.order_number}`,
        Author: storeBrand.store_name || 'Provoke Playtech'
      }
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = 595.28;
    const margin = 36;
    const contentWidth = pageWidth - margin * 2;

    // Header
    doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text(storeBrand.store_name || 'Provoke Playtech', margin, 36);
    doc.fillColor('#64748b').fontSize(8.5).font('Helvetica').text('WAREHOUSE FULFILLMENT PACKING SLIP', margin, 56);

    const rightBoxWidth = 200;
    const rightBoxX = pageWidth - margin - rightBoxWidth;
    doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text(`Order #: ${order.order_number}`, rightBoxX, 36, { width: rightBoxWidth, align: 'right' });
    const formattedDate = new Date(order.created_at || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.fillColor('#64748b').fontSize(8.5).font('Helvetica').text(`Date: ${formattedDate}`, rightBoxX, 52, { width: rightBoxWidth, align: 'right' });

    doc.moveTo(margin, 76).lineTo(pageWidth - margin, 76).strokeColor('#000000').lineWidth(1).stroke();

    // Ship To Section
    let shipY = 88;
    doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text('SHIP TO:', margin, shipY);
    shipY += 13;
    doc.fillColor('#334155').fontSize(8.5).font('Helvetica');
    doc.text(`Name: ${order.shipping_name || 'Customer'}`, margin, shipY);
    shipY += 11;
    doc.text(`Phone: ${order.shipping_phone || 'N/A'}`, margin, shipY);
    shipY += 11;
    doc.text(`Address: ${[order.shipping_line1, order.shipping_line2].filter(Boolean).join(', ')}`, margin, shipY);
    shipY += 11;
    doc.text(`${order.shipping_city}, ${order.shipping_state} - ${order.shipping_pin}`, margin, shipY);
    shipY += 18;

    // Items Checklist Table
    const tableHeaderY = shipY;
    doc.rect(margin, tableHeaderY, contentWidth, 20).fillColor('#e2e8f0').fill();
    doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold');
    doc.text('#', margin + 6, tableHeaderY + 5, { width: 20 });
    doc.text('ITEM DESCRIPTION', margin + 30, tableHeaderY + 5, { width: 300 });
    doc.text('QTY ORDERED', margin + 340, tableHeaderY + 5, { width: 80, align: 'center' });
    doc.text('VERIFICATION CHECK', margin + 430, tableHeaderY + 5, { width: 90, align: 'center' });

    let itemY = tableHeaderY + 20;
    items.forEach((item, idx) => {
      const rowHeight = 22;
      doc.rect(margin, itemY, contentWidth, rowHeight).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
      doc.fillColor('#475569').fontSize(8).font('Helvetica').text(String(idx + 1), margin + 6, itemY + 6);
      doc.fillColor('#0f172a').fontSize(8).font('Helvetica-Bold').text(`${item.product_name} ${item.sku ? `(SKU: ${item.sku})` : ''}`, margin + 30, itemY + 6, { width: 300, ellipsis: true });
      doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text(String(item.qty_ordered), margin + 340, itemY + 5, { width: 80, align: 'center' });
      doc.fillColor('#64748b').fontSize(8).font('Helvetica').text('[   ] Verified', margin + 430, itemY + 6, { width: 90, align: 'center' });
      itemY += rowHeight;
    });

    doc.end();
  });
}

module.exports = {
  generateInvoicePdf,
  generatePackingSlipPdf
};
