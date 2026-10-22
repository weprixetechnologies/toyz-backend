/**
 * Migration Script: Floating Widgets & Leads Database Setup
 *
 * Runs table creation, safe schema alters (idempotent), and default seed configuration.
 *
 * Usage:
 *   node backend/migrate_floating_widgets_and_leads.js
 *   or
 *   cd backend && node migrate_floating_widgets_and_leads.js
 */

const path = require('path');
const mysql = require('mysql2/promise');

// Load environment variables from backend/.env regardless of where the command is invoked
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'ecom_vishal'
};

const DEFAULT_WIDGETS_CONFIG = {
  contact_form: {
    enabled: true,
    title: 'Quick Inquiry / Contact Us',
    subtitle: 'Leave your contact details and requirement. Our team will get back to you shortly.',
    button_tooltip: 'Quick Contact',
    shake_interval_seconds: 6,
    button_color: '#0284c7'
  },
  chatbot: {
    enabled: true,
    bot_name: 'Provoke Playtech Assistant',
    bot_subtitle: 'Online • Quick Answers',
    welcome_message: 'Hi there! 👋 Welcome to Provoke Playtech. How can we help you today? Please choose an option below:',
    button_tooltip: 'Chat with Us',
    button_color: '#4f46e5',
    flow: [
      {
        id: 'root',
        title: 'Main Menu',
        options: [
          {
            id: 'opt_track',
            label: '📦 Track My Order',
            action_type: 'link',
            url: '/account/orders',
            response_message: 'You can view real-time shipping status and track your parcel directly in your orders dashboard.'
          },
          {
            id: 'opt_wholesale',
            label: '💼 Wholesale & Bulk Orders',
            action_type: 'message',
            response_message: 'We offer specialized wholesale pricing, MOQ tiered discounts, and verified retailer accounts! How would you like to proceed?',
            next_options: [
              {
                id: 'opt_apply_reseller',
                label: '📝 Apply for Reseller Account',
                action_type: 'link',
                url: '/account/apply-reseller',
                response_message: 'Redirecting you to our Reseller Onboarding form where you can register with your GSTIN.'
              },
              {
                id: 'opt_lead_bulk',
                label: '💬 Submit Bulk Inquiry',
                action_type: 'lead_form',
                response_message: 'Opening our quick lead form. Please enter your required quantity and product names!'
              }
            ]
          },
          {
            id: 'opt_offers',
            label: '🎁 Ongoing Offers & Discounts',
            action_type: 'link',
            url: '/offers',
            response_message: 'Check out our live promotions, voucher codes, and clearance sales!'
          },
          {
            id: 'opt_categories',
            label: '🧸 Browse Toy Categories',
            action_type: 'message',
            response_message: 'Explore our wide range of toys, RC vehicles, action figures, puzzles, and educational games:',
            next_options: [
              {
                id: 'opt_all_products',
                label: '🛒 All Products',
                action_type: 'link',
                url: '/products',
                response_message: 'Explore our full catalog.'
              },
              {
                id: 'opt_rc_cars',
                label: '🏎️ RC Cars & Trucks',
                action_type: 'link',
                url: '/categories/rc-cars',
                response_message: 'Check out our top remote-control models.'
              },
              {
                id: 'opt_blocks',
                label: '🧱 Building Blocks',
                action_type: 'link',
                url: '/categories/building-blocks',
                response_message: 'Explore our creative building blocks collection.'
              }
            ]
          },
          {
            id: 'opt_talk_rep',
            label: '📞 Contact Support Team',
            action_type: 'lead_form',
            response_message: 'Please leave your contact number and query below, and our support team will reach out promptly!'
          }
        ]
      }
    ]
  }
};

async function runMigration() {
  console.log('='.repeat(60));
  console.log('🚀 [Migration] Starting Database Migration...');
  console.log(`📡 [Migration] Target DB: ${dbConfig.database} @ ${dbConfig.host}:${dbConfig.port} (User: ${dbConfig.user})`);
  console.log('='.repeat(60));

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to MySQL database successfully.');

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. CREATE TABLE: leads
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[Step 1/3] Ensuring `leads` table exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(150) NOT NULL,
        phone       VARCHAR(25) NOT NULL,
        address     TEXT NULL,
        requirement TEXT NOT NULL,
        source      VARCHAR(50) DEFAULT 'floating_widget',
        status      ENUM('new','contacted','in_progress','converted','closed') DEFAULT 'new',
        notes       TEXT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_phone (phone),
        INDEX idx_status (status),
        INDEX idx_source (source),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Table `leads` created / verified.');

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. IDEMPOTENT ALTERS: Verify and alter existing columns & indexes if needed
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[Step 2/3] Checking schema columns & indexes for `leads` table (Idempotent Alters)...');

    // Fetch existing columns in leads table
    const [cols] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'leads'`,
      [dbConfig.database]
    );
    const existingColNames = cols.map((c) => c.COLUMN_NAME);

    // Safe column alters
    const columnDefinitions = [
      { name: 'address', sql: 'ALTER TABLE leads ADD COLUMN address TEXT NULL AFTER phone' },
      { name: 'source', sql: "ALTER TABLE leads ADD COLUMN source VARCHAR(50) DEFAULT 'floating_widget' AFTER requirement" },
      { name: 'status', sql: "ALTER TABLE leads ADD COLUMN status ENUM('new','contacted','in_progress','converted','closed') DEFAULT 'new' AFTER source" },
      { name: 'notes', sql: 'ALTER TABLE leads ADD COLUMN notes TEXT NULL AFTER status' }
    ];

    for (const colDef of columnDefinitions) {
      if (!existingColNames.includes(colDef.name)) {
        await connection.query(colDef.sql);
        console.log(`   ➕ Added missing column: \`${colDef.name}\``);
      } else {
        console.log(`   ✔ Column \`${colDef.name}\` already present.`);
      }
    }

    // Safe index alters
    const [indexes] = await connection.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'leads'`,
      [dbConfig.database]
    );
    const existingIndexNames = indexes.map((i) => i.INDEX_NAME);

    const indexDefinitions = [
      { name: 'idx_phone', sql: 'ALTER TABLE leads ADD INDEX idx_phone (phone)' },
      { name: 'idx_status', sql: 'ALTER TABLE leads ADD INDEX idx_status (status)' },
      { name: 'idx_source', sql: 'ALTER TABLE leads ADD INDEX idx_source (source)' },
      { name: 'idx_created_at', sql: 'ALTER TABLE leads ADD INDEX idx_created_at (created_at)' }
    ];

    for (const idxDef of indexDefinitions) {
      if (!existingIndexNames.includes(idxDef.name)) {
        await connection.query(idxDef.sql);
        console.log(`   ➕ Added missing index: \`${idxDef.name}\``);
      } else {
        console.log(`   ✔ Index \`${idxDef.name}\` already present.`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. SEED SETTINGS: floating_widgets_config
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[Step 3/3] Checking default settings for `floating_widgets_config`...');
    const [existingSetting] = await connection.query(
      "SELECT setting_key FROM settings WHERE setting_key = 'floating_widgets_config' LIMIT 1"
    );

    if (existingSetting.length === 0) {
      await connection.query(
        `INSERT INTO settings (setting_key, setting_value, setting_group, description)
         VALUES ('floating_widgets_config', ?, 'general', 'Floating widgets and conditional chatbot flow configuration')`,
        [JSON.stringify(DEFAULT_WIDGETS_CONFIG)]
      );
      console.log('✅ Seeded default `floating_widgets_config` into `settings` table.');
    } else {
      console.log('✔ Setting `floating_widgets_config` already exists in `settings`.');
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 [Migration Complete] All database tables and alters are in sync!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n❌ [Migration Failed]:', error.message);
    if (error.sql) console.error('SQL:', error.sql);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed.');
    }
  }
}

// Execute migration
if (require.main === module) {
  runMigration();
}

module.exports = runMigration;
