const { query, pool } = require('../src/config/db');
const bcrypt = require('bcryptjs');

async function seedAdmin() {
  try {
    const email = 'superadmin@example.com';
    const password = 'password123';
    const name = 'Super Admin';
    const phone = '9999999999';

    const hash = await bcrypt.hash(password, 10);

    const [existing] = await pool.query('SELECT * FROM users WHERE email = ? OR phone = ?', [email, phone]);

    if (existing.length > 0) {
      const user = existing[0];
      await pool.query(
        'UPDATE users SET name = ?, email = ?, password_hash = ?, role = "superadmin", email_verified = 1, phone_verified = 1 WHERE id = ?',
        [name, email, hash, user.id]
      );
      console.log(`[SEED SUCCESS] Updated existing user (ID #${user.id}) to superadmin with email '${email}' and password '${password}'`);
    } else {
      const [result] = await pool.query(
        'INSERT INTO users (name, email, phone, password_hash, role, email_verified, phone_verified) VALUES (?, ?, ?, ?, "superadmin", 1, 1)',
        [name, email, phone, hash]
      );
      console.log(`[SEED SUCCESS] Created new superadmin user (ID #${result.insertId}) with email '${email}' and password '${password}'`);
    }

    process.exit(0);
  } catch (error) {
    console.error('[SEED ERROR]', error);
    process.exit(1);
  }
}

seedAdmin();
