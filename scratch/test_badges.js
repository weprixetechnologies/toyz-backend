const { query } = require('../src/config/db');

async function testBadges() {
  console.log('--- Testing Badge System Database & Endpoints ---');

  // 1. Insert test badge
  const res = await query(
    `INSERT INTO badges (name, badge_text, bg_color, text_color, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    ['Hot Summer Sale', 'HOT DEAL', '#f97316', '#ffffff', 1]
  );
  const badgeId = res.insertId;
  console.log('✅ Created Badge ID:', badgeId);

  // 2. Fetch products to attach
  const prods = await query('SELECT id, name FROM products LIMIT 3');
  console.log(`Found ${prods.length} products to attach.`);

  if (prods.length > 0) {
    for (const p of prods) {
      await query('INSERT IGNORE INTO product_badges (product_id, badge_id) VALUES (?, ?)', [p.id, badgeId]);
    }
    console.log(`✅ Attached Badge ${badgeId} to products:`, prods.map(p => p.id));
  }

  // 3. Query product badges
  const attached = await query(
    `SELECT p.id as product_id, p.name as product_name, b.badge_text, b.bg_color, b.text_color
     FROM product_badges pb
     JOIN products p ON pb.product_id = p.id
     JOIN badges b ON pb.badge_id = b.id
     WHERE b.id = ?`,
    [badgeId]
  );
  console.log('✅ Attached Badges Output:', JSON.stringify(attached, null, 2));

  // 4. Cleanup test data
  await query('DELETE FROM badges WHERE id = ?', [badgeId]);
  console.log('✅ Cleaned up test badge.');

  console.log('--- Badge System Verification Successful ---');
  process.exit(0);
}

testBadges().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
