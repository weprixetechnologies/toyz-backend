const http = require('http');

const BASE_URL = 'https://backend.provokeplaytech.com/api/v1';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const reqOpts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOpts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (e) {
          json = body;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

let adminToken = '';
let staffUserId = null;
let testCustomerId = null;

async function runTests() {
  console.log('====================================================');
  console.log('       RUNNING AUTOMATED PHASE 5 TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName, failureDetail = '') {
    total++;
    if (condition) {
      console.log(`[PASS] ${total}. ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${total}. ${testName} - ${failureDetail}`);
    }
  }

  try {
    // 1. Health Check
    const health = await request('/health');
    assert(health.status === 200 && health.body.success === true, 'API Health Check');

    // 2. Superadmin Auth Setup
    const timestamp = Date.now();
    const adminEmail = `superadmin_${timestamp}@test.com`;

    const adminReg = await request('/auth/register', {
      method: 'POST',
      body: { phone: '9999988888', password: 'Password123!', name: 'Super Admin', email: adminEmail }
    });

    if (adminReg.status === 201 && adminReg.body.data) {
      adminToken = adminReg.body.data.tokens.accessToken;
      const db = require('../src/config/db');
      await db.query("UPDATE users SET role = 'superadmin' WHERE id = ?", [adminReg.body.data.user.id]);
    } else {
      const adminLogin = await request('/auth/login', {
        method: 'POST',
        body: { email: adminEmail, password: 'Password123!' }
      });
      adminToken = adminLogin.body.data.tokens.accessToken;
    }

    // Register a test customer for segment tags
    const custReg = await request('/auth/register', {
      method: 'POST',
      body: { phone: `96${Math.floor(10000000 + Math.random() * 90000000)}`, password: 'Password123!', name: 'Segment Customer', email: `segcust_${timestamp}@test.com` }
    });
    testCustomerId = custReg.body.data.user.id;

    // ----------------------------------------------------
    // TEST GROUP 1: ADMIN STAFF & PERMISSIONS
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 1: ADMIN STAFF & PERMISSIONS ---');

    const createStaff = await request('/admin/staff', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: 'Support Agent Bob',
        email: `support_${timestamp}@test.com`,
        phone: '9888877777',
        password: 'Password123!',
        role: 'support_agent',
        permissions: { orders: { view: true, edit: true, delete: false }, products: { view: true, edit: false, delete: false } }
      }
    });
    assert(createStaff.status === 201 && createStaff.body.success === true, 'Create Staff User Account', JSON.stringify(createStaff.body));
    staffUserId = createStaff.body.data.id;

    const listStaff = await request('/admin/staff', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(listStaff.status === 200 && Array.isArray(listStaff.body.data), 'List Admin Staff Users');

    const updateStaff = await request(`/admin/staff/${staffUserId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { role: 'inventory_manager', status: 'active' }
    });
    assert(updateStaff.status === 200 && updateStaff.body.data.role === 'inventory_manager', 'Update Staff Role & Permissions');

    const delStaff = await request(`/admin/staff/${staffUserId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(delStaff.status === 200 && delStaff.body.success === true, 'Delete Staff User Account');

    // ----------------------------------------------------
    // TEST GROUP 2: ANALYTICS & REPORTING SUITE
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 2: ANALYTICS & REPORTING SUITE ---');

    const dashboardKpi = await request('/admin/reports/dashboard', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(dashboardKpi.status === 200 && dashboardKpi.body.data.gmv !== undefined, 'Executive Dashboard KPIs');

    const salesReport = await request('/admin/reports/sales', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(salesReport.status === 200 && salesReport.body.data.summary !== undefined, 'Sales Aggregate Report');

    const salesExport = await request('/admin/reports/sales/export', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(salesExport.status === 200 && typeof salesExport.body === 'string' && salesExport.body.startsWith('Order Number'), 'Export Sales Report CSV');

    const ordersReport = await request('/admin/reports/orders', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(ordersReport.status === 200 && Array.isArray(ordersReport.body.data), 'Order Volume & Status Report');

    const productsReport = await request('/admin/reports/products', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(productsReport.status === 200 && Array.isArray(productsReport.body.data), 'Product Performance Report');

    const customerReport = await request('/admin/reports/customers', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(customerReport.status === 200 && Array.isArray(customerReport.body.data), 'Customer LTV Report');

    const affiliateReport = await request('/admin/reports/affiliates', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(affiliateReport.status === 200 && Array.isArray(affiliateReport.body.data), 'Affiliate Network Report');

    const inventoryReport = await request('/admin/reports/inventory', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(inventoryReport.status === 200 && inventoryReport.body.data.valuation !== undefined, 'Inventory Valuation Report');

    // ----------------------------------------------------
    // TEST GROUP 3: CSV IMPORT/EXPORT & BULK OPS
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 3: CSV IMPORT/EXPORT & BULK OPS ---');

    const exportProd = await request('/products/export', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(exportProd.status === 200 && typeof exportProd.body === 'string' && exportProd.body.startsWith('sku,name'), 'Export Products Catalog CSV');

    const csvSample = `sku,name,slug,base_price,stock_qty\nBULK-SKU-1_${timestamp},Bulk Imported Item 1,bulk-item-1-${timestamp},500.00,100\nBULK-SKU-2_${timestamp},Bulk Imported Item 2,bulk-item-2-${timestamp},750.00,200`;
    const importProd = await request('/products/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { csv_data: csvSample }
    });
    assert(importProd.status === 200 && importProd.body.data.imported_count === 2, 'Import Products CSV (Batched Event Emitted)');

    // Bulk Order Status Update
    const bulkOrderStatus = await request('/admin/orders/bulk-status', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { order_ids: [1], status: 'processing', note: 'Bulk processing batch' }
    });
    assert(bulkOrderStatus.status === 200 && bulkOrderStatus.body.success === true, 'Bulk Update Order Status');

    // Customer Segmentation Tags
    const updateSegTags = await request(`/users/${testCustomerId}/segment-tags`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { tags: ['VIP', 'Wholesale_Priority'] }
    });
    assert(updateSegTags.status === 200 && updateSegTags.body.data && updateSegTags.body.data.segment_tags === 'VIP,Wholesale_Priority', 'Update Customer Segmentation Tags', JSON.stringify({ status: updateSegTags.status, body: updateSegTags.body }));

    // ----------------------------------------------------
    // TEST GROUP 4: ACTIVITY LOG & SMS TEMPLATES
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 4: ACTIVITY LOG & SMS TEMPLATES ---');

    const activityLog = await request('/admin/activity-log', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(activityLog.status === 200 && Array.isArray(activityLog.body.data.logs), 'List Paginated Activity Logs');

    const activityExport = await request('/admin/activity-log/export', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(activityExport.status === 200 && typeof activityExport.body === 'string' && activityExport.body.startsWith('ID,Timestamp'), 'Export Activity Log CSV', JSON.stringify({ status: activityExport.status, body: activityExport.body }));

    const smsTemplates = await request('/admin/sms/templates', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(smsTemplates.status === 200 && Array.isArray(smsTemplates.body.data), 'List SMS Notification Templates', JSON.stringify({ status: smsTemplates.status, body: smsTemplates.body }));

    const updateSmsTemp = await request('/admin/sms/templates/order_placed', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { name: 'Order Placed Alert', body: 'Hi {{name}}, your order {{order_number}} of {{amount}} is placed!' }
    });
    assert(updateSmsTemp.status === 200 && updateSmsTemp.body.data.template_id === 'order_placed', 'Update SMS Template Body & Variables');

    // ----------------------------------------------------
    // TEST GROUP 5: CACHE ADMINISTRATION
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 5: CACHE ADMINISTRATION ---');

    const flushCache = await request('/admin/cache/flush', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(flushCache.status === 200 && flushCache.body.success === true, 'Superadmin Flush Redis Cache');

  } catch (err) {
    console.error('Phase 5 Test Suite Fatal Error:', err);
  }

  console.log('\n====================================================');
  console.log(`  PHASE 5 TEST SUMMARY: ${passed}/${total} PASSED`);
  console.log('====================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
