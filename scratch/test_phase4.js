const http = require('http');

const BASE_URL = 'http://72.60.219.181:46711/api/v1';

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let adminToken = '';
let userToken = '';
let affiliateToken = '';
let userId = null;
let affiliateUserId = null;
let affiliateRefCode = '';
let testProductId = null;

async function runTests() {
  console.log('====================================================');
  console.log('       RUNNING AUTOMATED PHASE 4 TEST SUITE');
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

    // 2. Admin & User Auth setup
    const timestamp = Date.now();
    const adminEmail = `admin_${timestamp}@test.com`;

    const adminReg = await request('/auth/register', {
      method: 'POST',
      body: { phone: '9999999999', password: 'Password123!', name: 'Super Admin', email: adminEmail }
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

    // Register Customer User
    const userReg = await request('/auth/register', {
      method: 'POST',
      body: { phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`, password: 'Password123!', name: 'Regular Customer', email: `cust_${timestamp}@test.com` }
    });
    userToken = userReg.body.data.tokens.accessToken;
    userId = userReg.body.data.user.id;

    // Register Affiliate User
    const affUserReg = await request('/auth/register', {
      method: 'POST',
      body: { phone: `97${Math.floor(10000000 + Math.random() * 90000000)}`, password: 'Password123!', name: 'Partner Affiliate', email: `aff_${timestamp}@test.com` }
    });
    affiliateToken = affUserReg.body.data.tokens.accessToken;
    affiliateUserId = affUserReg.body.data.user.id;

    // ----------------------------------------------------
    // TEST GROUP 1: AFFILIATE PROGRAM
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 1: AFFILIATE PROGRAM ---');

    // Register Affiliate
    const affReg = await request('/affiliate/register', {
      method: 'POST',
      headers: { Authorization: `Bearer ${affiliateToken}` },
      body: { referralCode: `partner_${timestamp}`, bankName: 'HDFC Bank', accountNumber: '1234567890', ifsc: 'HDFC0001234', upiId: 'aff@upi' }
    });
    if (affReg.status !== 201) console.log('affReg Error Response:', affReg.status, affReg.body);
    assert(affReg.status === 201 && affReg.body.success === true, 'Register Affiliate Profile');
    affiliateRefCode = affReg.body.data ? affReg.body.data.referral_code : '';

    // Fetch Dashboard
    const affDash = await request('/affiliate/dashboard', {
      headers: { Authorization: `Bearer ${affiliateToken}` }
    });
    assert(affDash.status === 200 && affDash.body.data.profile.referral_code === affiliateRefCode, 'Get Affiliate Dashboard');

    // Track Referral Click
    const trackClick = await request(`/affiliate/track?ref=${affiliateRefCode}`);
    assert(trackClick.status === 200 && trackClick.body.success === true, 'Track Referral Link Click (sets cookie)');

    // Admin List Affiliates
    const adminAffs = await request('/affiliate/admin/list', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminAffs.status === 200 && Array.isArray(adminAffs.body.data), 'Admin List Affiliates');

    // Admin Set Commission Tier
    const setTier = await request(`/affiliate/admin/${affReg.body.data.id}/commission`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { commissionType: 'percent', commissionValue: 10.0 }
    });
    assert(setTier.status === 200 && setTier.body.success === true, 'Admin Set Custom Affiliate Commission Tier');

    // Create a product for testing
    const catRes = await request('/categories', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { name: `Affiliate Test Category ${timestamp}`, slug: `aff-cat-${timestamp}` }
    });
    const catId = catRes.body.data.id;

    const prodRes = await request('/products', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: `Affiliate Test Product ${timestamp}`,
        slug: `aff-prod-${timestamp}`,
        category_id: catId,
        base_price: 1000.00,
        sku: `AFF-PROD-${timestamp}`,
        stock_qty: 100,
        status: 'published'
      }
    });
    testProductId = prodRes.body.data.id;

    // Add item to cart for Regular Customer
    await request('/cart/items', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: { product_id: testProductId, qty: 2 }
    });

    // Add address for Regular Customer
    const addrRes = await request('/users/addresses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: { name: 'Customer Test', phone: '9876543210', line1: '123 Main St', city: 'Mumbai', state: 'Maharashtra', pin_code: '400001' }
    });
    const shippingAddressObj = { name: 'Customer Test', phone: '9876543210', line1: '123 Main St', city: 'Mumbai', state: 'Maharashtra', pin_code: '400001', country: 'India' };

    // Customer places order with ref_code
    const orderRes = await request('/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: { shipping_address: shippingAddressObj, ref_code: affiliateRefCode }
    });
    if (orderRes.status !== 201) console.log('orderRes Error Response:', orderRes.status, orderRes.body);
    assert(orderRes.status === 201 && orderRes.body.success === true, 'Place Order with Affiliate Ref Code');
    const orderId = orderRes.body.data ? (orderRes.body.data.order ? orderRes.body.data.order.id : orderRes.body.data.id) : null;

    // Wait 200ms for async event listener to calculate commission
    await sleep(250);

    // Check Affiliate Commissions Log
    const affComms = await request('/affiliate/commissions', {
      headers: { Authorization: `Bearer ${affiliateToken}` }
    });
    assert(affComms.status === 200 && affComms.body.data.length > 0, 'Affiliate Commission Calculated Asynchronously on order.placed');

    // Submit Payout Request
    const payoutReq = await request('/affiliate/payout/request', {
      method: 'POST',
      headers: { Authorization: `Bearer ${affiliateToken}` },
      body: { amount: 50.00, method: 'upi' }
    });
    assert(payoutReq.status === 201 && payoutReq.body.success === true, 'Submit Affiliate Payout Request');
    const payoutId = payoutReq.body.data.payoutId;

    // Admin List & Process Payout Request
    const adminPayouts = await request('/affiliate/admin/payouts', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminPayouts.status === 200 && adminPayouts.body.data.length > 0, 'Admin List Payout Requests');

    const processPayout = await request(`/affiliate/admin/payouts/${payoutId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: 'paid', admin_note: 'Payout processed successfully via UPI' }
    });
    assert(processPayout.status === 200 && processPayout.body.data.status === 'paid', 'Admin Process Affiliate Payout to PAID');

    // ----------------------------------------------------
    // TEST GROUP 2: SPLIT SHIPMENTS (§6.3 WORKED EXAMPLE)
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 2: SPLIT SHIPMENTS (§6.3 LOGIC) ---');

    // Create Products A, B, C, D
    const createProd = async (name, sku, price) => {
      const p = await request('/products', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { name, slug: sku.toLowerCase() + `-${timestamp}`, category_id: catId, base_price: price, sku: sku + `-${timestamp}`, stock_qty: 50, status: 'published' }
      });
      return p.body.data.id;
    };

    const prodA = await createProd('Product A', 'PROD-A', 100);
    const prodB = await createProd('Product B', 'PROD-B', 200);
    const prodC = await createProd('Product C', 'PROD-C', 300);
    const prodD = await createProd('Product D', 'PROD-D', 400);

    // Apply & approve user as reseller so we test per-item reseller order approval flow
    const applyRes = await request('/reseller/apply', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: { business_name: 'Reseller Ltd', gstin: '27AAAAA0000A1Z5' }
    });
    const profileId = applyRes.body.data.profile_id;
    await request(`/admin/resellers/${profileId}/approve`, { method: 'PUT', headers: { Authorization: `Bearer ${adminToken}` } });

    // Enable reseller order approval in settings
    await request('/settings', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { reseller_order_approval: '1' }
    });

    // Add A, B, C, D to cart
    await request('/cart/items', { method: 'POST', headers: { Authorization: `Bearer ${userToken}` }, body: { product_id: prodA, qty: 10 } });
    await request('/cart/items', { method: 'POST', headers: { Authorization: `Bearer ${userToken}` }, body: { product_id: prodB, qty: 5 } });
    await request('/cart/items', { method: 'POST', headers: { Authorization: `Bearer ${userToken}` }, body: { product_id: prodC, qty: 3 } });
    await request('/cart/items', { method: 'POST', headers: { Authorization: `Bearer ${userToken}` }, body: { product_id: prodD, qty: 1 } });

    // Place Reseller Order (lands in pending_approval)
    const splitOrderRes = await request('/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: { shipping_address: shippingAddressObj }
    });
    const splitOrderId = splitOrderRes.body.data.order.id;
    assert(splitOrderRes.body.data.order.status === 'pending_approval', 'Reseller Order Created in pending_approval');

    // Fetch order details for admin approval
    const orderDetails = await request(`/admin/orders/${splitOrderId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const items = orderDetails.body.data.items;
    const itemA = items.find(i => i.product_id === prodA);
    const itemB = items.find(i => i.product_id === prodB);
    const itemC = items.find(i => i.product_id === prodC);
    const itemD = items.find(i => i.product_id === prodD);

    // Admin approves A, B, C, and REJECTS D!
    await request(`/admin/orders/${splitOrderId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        items: [
          { id: itemA.id, qty_approved: 10 },
          { id: itemB.id, qty_approved: 5 },
          { id: itemC.id, qty_approved: 3 },
          { id: itemD.id, qty_approved: 0 }
        ]
      }
    });

    // Create Shipment 1: Full Qty of A (10) and B (5)
    const ship1Res = await request(`/shipping/admin/orders/${splitOrderId}/shipments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        carrier: 'DTDC Courier',
        tracking_number: 'DTDC12345',
        items: [
          { order_item_id: itemA.id, qty: 10 },
          { order_item_id: itemB.id, qty: 5 }
        ]
      }
    });
    assert(ship1Res.status === 201 && ship1Res.body.data.order_status === 'partially_shipped', 'Shipment 1 Created (A & B shipped) -> Order Status PARTIALLY_SHIPPED', JSON.stringify({ status: ship1Res.status, body: ship1Res.body }));

    // Attempt to ship rejected item D -> Should Fail
    const rejectShipAttempt = await request(`/shipping/admin/orders/${splitOrderId}/shipments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        carrier: 'DTDC Courier',
        tracking_number: 'DTDC12349',
        items: [{ order_item_id: itemD.id, qty: 1 }]
      }
    });
    assert(rejectShipAttempt.status >= 400, 'Shipment Picker Blocks Rejected Item D');

    // Create Shipment 2: Full Qty of C (3)
    const ship2Res = await request(`/shipping/admin/orders/${splitOrderId}/shipments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        carrier: 'DTDC Courier',
        tracking_number: 'DTDC12346',
        items: [
          { order_item_id: itemC.id, qty: 3 }
        ]
      }
    });
    assert(ship2Res.status === 201 && ship2Res.body.data.order_status === 'shipped', 'Shipment 2 Created (C shipped) -> Order Status SHIPPED (completeness on accepted items only)', JSON.stringify({ status: ship2Res.status, body: ship2Res.body }));

    // Customer order shipments lookup
    const custShipments = await request(`/shipping/orders/${splitOrderId}/shipments`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert(custShipments.status === 200 && custShipments.body.data.shipments.length === 2 && custShipments.body.data.unfulfilled_rejected_items.length === 1, 'Customer Order Detail lists 2 Shipments + Separate Rejected/Unfulfilled Section', JSON.stringify({ status: custShipments.status, body: custShipments.body }));

    // ----------------------------------------------------
    // TEST GROUP 3: SHIPPING PRESETS
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 3: SHIPPING PRESETS ---');

    const createPreset = await request('/shipping/admin/presets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { label: 'Express Air Shipping', description: 'Next day delivery', cost: 150.00, estimated_days: '1-2 days', sort_order: 1 }
    });
    assert(createPreset.status === 201 && createPreset.body.success === true, 'Create Shipping Preset');
    const presetId = createPreset.body.data.id;

    const listPresets = await request('/shipping/options');
    assert(listPresets.status === 200 && listPresets.body.data.some(p => p.id === presetId), 'Public List Shipping Options');

    const updatePreset = await request(`/shipping/admin/presets/${presetId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { cost: 175.00 }
    });
    assert(updatePreset.status === 200 && parseFloat(updatePreset.body.data.cost) === 175.00, 'Update Shipping Preset');

    const delPreset = await request(`/shipping/admin/presets/${presetId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(delPreset.status === 200 && delPreset.body.success === true, 'Delete Shipping Preset');

    // ----------------------------------------------------
    // TEST GROUP 4: WISHLIST & RECENTLY VIEWED
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 4: WISHLIST & RECENTLY VIEWED ---');

    // Add to Wishlist
    const addWish = await request('/wishlist', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: { product_id: prodA }
    });
    assert(addWish.status === 201 && addWish.body.success === true, 'Add Product to Wishlist');

    // Get Wishlist
    const getWish = await request('/wishlist', {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert(getWish.status === 200 && getWish.body.data.length > 0, 'Get User Wishlist', JSON.stringify({ status: getWish.status, body: getWish.body }));

    // Move to Cart
    const moveCart = await request(`/wishlist/${prodA}/move-to-cart`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert(moveCart.status === 200 && moveCart.body.success === true, 'Move Wishlist Item to Cart');

    // Record Product View
    const recView = await request(`/products/${prodB}/viewed`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: {}
    });
    assert(recView.status === 200 && recView.body.success === true, 'Record Product View');

    // Get Recently Viewed
    const getRecent = await request('/products/recently-viewed', {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert(getRecent.status === 200 && getRecent.body.data.some(r => r.product_id === prodB), 'Get Recently Viewed History', JSON.stringify({ status: getRecent.status, body: getRecent.body }));

    // ----------------------------------------------------
    // TEST GROUP 5: SEO & SITEMAP
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 5: SEO & SITEMAP ---');

    const genSitemap = await request('/seo/admin/generate-sitemap', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(genSitemap.status === 200 && typeof genSitemap.body === 'string' && genSitemap.body.includes('<urlset'), 'Generate Sitemap XML', JSON.stringify({ status: genSitemap.status, body: genSitemap.body }));

    const updateSeo = await request('/seo/admin/pages/home', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { title: 'WePrixe - Premier E-Commerce', description: 'Best deals online', og_image: 'https://weprixe.com/og-home.png' }
    });
    assert(updateSeo.status === 200 && updateSeo.body.data.title === 'WePrixe - Premier E-Commerce', 'Update Page SEO Metadata');

    const getSeo = await request('/seo/pages/home');
    assert(getSeo.status === 200 && getSeo.body.data.page_key === 'home', 'Public Get Page SEO Metadata');

  } catch (err) {
    console.error('Test Suite Fatal Error:', err);
  }

  console.log('\n====================================================');
  console.log(`  PHASE 4 TEST SUMMARY: ${passed}/${total} PASSED`);
  console.log('====================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
