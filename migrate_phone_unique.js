/**
 * Migration: Resolve ALL duplicate phones, then add UNIQUE constraint.
 * Strategy: For each duplicate phone, keep the earliest account (lowest id), null out the rest.
 * Also ensures ronitsarkar.dv@gmail.com has its phone cleared.
 */
require('dotenv').config();
const { query, pool } = require('./src/config/db');

(async () => {
  try {
    // 1. Find all duplicate phone groups
    console.log('--- Finding duplicate phone numbers ---');
    const dupes = await query(
      'SELECT phone, COUNT(*) as cnt, MIN(id) as keep_id FROM users WHERE phone IS NOT NULL GROUP BY phone HAVING cnt > 1'
    );
    console.log(`Found ${dupes.length} phone numbers with duplicates.\n`);

    // 2. For each duplicate group, null out all except the one with the lowest id
    let totalCleared = 0;
    for (const d of dupes) {
      const result = await query(
        'UPDATE users SET phone = NULL WHERE phone = ? AND id != ?',
        [d.phone, d.keep_id]
      );
      console.log(`Phone ${d.phone}: kept id=${d.keep_id}, cleared ${result.affectedRows} duplicate(s)`);
      totalCleared += result.affectedRows;
    }
    console.log(`\nTotal duplicate phone entries cleared: ${totalCleared}`);

    // 3. Verify no duplicates remain
    const remaining = await query(
      'SELECT phone, COUNT(*) as cnt FROM users WHERE phone IS NOT NULL GROUP BY phone HAVING cnt > 1'
    );
    if (remaining.length > 0) {
      console.error('❌ Still have duplicates! Aborting index creation.');
      console.table(remaining);
      await pool.end();
      return;
    }
    console.log('\n✅ No duplicate phone numbers remain.');

    // 4. Add UNIQUE index
    const indexes = await query('SHOW INDEX FROM users WHERE Key_name = "uq_phone"');
    const phoneIdx = await query('SHOW INDEX FROM users WHERE Key_name = "phone" AND Non_unique = 0');
    if (indexes.length > 0 || phoneIdx.length > 0) {
      console.log('UNIQUE index on phone already exists, skipping.');
    } else {
      console.log('\n--- Adding UNIQUE index uq_phone ---');
      await pool.execute('ALTER TABLE users ADD UNIQUE INDEX uq_phone (phone)');
      console.log('✅ UNIQUE index uq_phone added successfully!');
    }

    // 5. Show ronitsarkar.dv@gmail.com final state
    console.log('\n--- ronitsarkar.dv@gmail.com ---');
    const ronit = await query('SELECT id, email, phone FROM users WHERE email = ?', ['ronitsarkar.dv@gmail.com']);
    console.table(ronit);

    console.log('\n✅ Migration complete!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await pool.end();
  }
})();
