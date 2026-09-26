const { query } = require('../src/config/db');

async function testUserOrders() {
  console.log('--- Testing Customers & Resellers Endpoints ---');

  // 1. Fetch users list with aggregated order counts and spend
  const users = await query(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.status,
            (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as total_orders,
            (SELECT COALESCE(SUM(grand_total), 0) FROM orders WHERE user_id = u.id AND status != 'cancelled') as total_spend
     FROM users u
     ORDER BY u.id DESC
     LIMIT 5`
  );

  console.log('✅ Found Users:', users.length);
  console.log(JSON.stringify(users, null, 2));

  if (users.length > 0) {
    const testUser = users[0];
    const orders = await query(
      `SELECT o.*,
              (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count
       FROM orders o
       WHERE o.user_id = ?
       ORDER BY o.id DESC`,
      [testUser.id]
    );
    console.log(`✅ User #${testUser.id} (${testUser.name}) orders count: ${orders.length}`);
  }

  console.log('--- Customer & Reseller Orders Verification Successful ---');
  process.exit(0);
}

testUserOrders().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
