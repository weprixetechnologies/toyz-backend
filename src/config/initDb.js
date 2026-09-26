const mysql = require('mysql2/promise');
require('dotenv').config();

async function initDb() {
  console.log('[DB Init] Connecting to MySQL server...');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || ''
  });

  const dbName = process.env.DB_NAME || 'ecom_vishal';
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await connection.query(`USE \`${dbName}\`;`);
  console.log(`[DB Init] Using database '${dbName}'`);

  const tables = [
    // 1. users
    `CREATE TABLE IF NOT EXISTS users (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name            VARCHAR(120) NOT NULL,
      email           VARCHAR(191) UNIQUE NOT NULL,
      phone           VARCHAR(20) UNIQUE,
      phone_verified  TINYINT(1) DEFAULT 0,
      email_verified  TINYINT(1) DEFAULT 0,
      password_hash   VARCHAR(255) NOT NULL,
      role            ENUM('customer','retailer','admin','superadmin','inventory_manager','support_agent') DEFAULT 'customer',
      status          ENUM('active','inactive','banned') DEFAULT 'active',
      avatar          VARCHAR(500),
      gstin           VARCHAR(20),
      referral_code   VARCHAR(20) UNIQUE,
      referred_by     INT UNSIGNED,
      affiliate_id    INT UNSIGNED,
      segment_tags    TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at      DATETIME NULL,
      FOREIGN KEY (referred_by) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_email (email),
      INDEX idx_phone (phone),
      INDEX idx_role  (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 2. user_addresses
    `CREATE TABLE IF NOT EXISTS user_addresses (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id      INT UNSIGNED NOT NULL,
      label        VARCHAR(60),
      name         VARCHAR(120),
      phone        VARCHAR(20),
      line1        VARCHAR(255) NOT NULL,
      line2        VARCHAR(255),
      city         VARCHAR(100) NOT NULL,
      state        VARCHAR(100) NOT NULL,
      pin_code     VARCHAR(10) NOT NULL,
      country      VARCHAR(80) DEFAULT 'India',
      is_default   TINYINT(1) DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 3. refresh_tokens
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id     INT UNSIGNED NOT NULL,
      token_hash  VARCHAR(255) NOT NULL,
      expires_at  DATETIME NOT NULL,
      revoked     TINYINT(1) DEFAULT 0,
      ip_address  VARCHAR(45),
      user_agent  TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_token (token_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 4. otps
    `CREATE TABLE IF NOT EXISTS otps (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id     INT UNSIGNED,
      phone       VARCHAR(20),
      email       VARCHAR(191),
      otp_hash    VARCHAR(255) NOT NULL,
      purpose     ENUM('phone_verify','email_verify','login','password_reset') NOT NULL,
      expires_at  DATETIME NOT NULL,
      used        TINYINT(1) DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_phone_purpose (phone, purpose),
      INDEX idx_email_purpose (email, purpose)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 5. admin_permissions
    `CREATE TABLE IF NOT EXISTS admin_permissions (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id     INT UNSIGNED NOT NULL UNIQUE,
      permissions JSON NOT NULL,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 6. categories
    `CREATE TABLE IF NOT EXISTS categories (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      parent_id       INT UNSIGNED NULL,
      name            VARCHAR(150) NOT NULL,
      slug            VARCHAR(191) UNIQUE NOT NULL,
      description     TEXT,
      image           VARCHAR(500),
      banner_image    VARCHAR(500),
      meta_title      VARCHAR(200),
      meta_desc       VARCHAR(400),
      og_image        VARCHAR(500),
      sort_order      INT DEFAULT 0,
      is_active       TINYINT(1) DEFAULT 1,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL,
      INDEX idx_slug (slug),
      INDEX idx_parent (parent_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 7. brands
    `CREATE TABLE IF NOT EXISTS brands (
      id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(150) NOT NULL,
      slug       VARCHAR(191) UNIQUE NOT NULL,
      logo       VARCHAR(500),
      is_active  TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 8. attribute_groups
    `CREATE TABLE IF NOT EXISTS attribute_groups (
      id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      slug       VARCHAR(100) NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 9. attribute_values
    `CREATE TABLE IF NOT EXISTS attribute_values (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      group_id     INT UNSIGNED NOT NULL,
      value        VARCHAR(200) NOT NULL,
      display_name VARCHAR(200),
      sort_order   INT DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES attribute_groups(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 10. products
    `CREATE TABLE IF NOT EXISTS products (
      id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      category_id           INT UNSIGNED,
      brand_id              INT UNSIGNED,
      name                  VARCHAR(255) NOT NULL,
      slug                  VARCHAR(300) UNIQUE NOT NULL,
      short_desc            TEXT,
      description           LONGTEXT,
      product_type          ENUM('simple','variable') DEFAULT 'simple',
      base_price            DECIMAL(12,2) NOT NULL,
      sale_price            DECIMAL(12,2) NULL,
      cost_price            DECIMAL(12,2) NULL,
      sku                   VARCHAR(100) UNIQUE,
      barcode               VARCHAR(100),
      tax_class             VARCHAR(80) DEFAULT 'standard',
      tax_rate              DECIMAL(5,2) DEFAULT 18.00,
      hsn_code              VARCHAR(20),
      weight_grams          INT,
      length_cm             DECIMAL(8,2),
      width_cm              DECIMAL(8,2),
      height_cm             DECIMAL(8,2),
      is_digital            TINYINT(1) DEFAULT 0,
      digital_file          VARCHAR(500),
      track_inventory       TINYINT(1) DEFAULT 1,
      stock_qty             INT DEFAULT 0,
      low_stock_threshold   INT DEFAULT 5,
      allow_backorder       TINYINT(1) DEFAULT 0,
      auto_disable_oos      TINYINT(1) DEFAULT 1,
      is_active             TINYINT(1) DEFAULT 1,
      is_featured           TINYINT(1) DEFAULT 0,
      visible_to_resellers  TINYINT(1) DEFAULT 1,
      meta_title            VARCHAR(200),
      meta_desc             VARCHAR(400),
      og_image              VARCHAR(500),
      canonical_url         VARCHAR(500),
      affiliate_commission_type   ENUM('percent','flat') DEFAULT 'percent',
      affiliate_commission_value  DECIMAL(10,2) DEFAULT 0,
      created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at            DATETIME NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
      INDEX idx_slug      (slug),
      INDEX idx_category  (category_id),
      INDEX idx_active    (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 11. product_images
    `CREATE TABLE IF NOT EXISTS product_images (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      product_id  INT UNSIGNED NOT NULL,
      url         VARCHAR(500) NOT NULL,
      alt_text    VARCHAR(200),
      sort_order  INT DEFAULT 0,
      is_primary  TINYINT(1) DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 12. product_variants
    `CREATE TABLE IF NOT EXISTS product_variants (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      product_id      INT UNSIGNED NOT NULL,
      sku             VARCHAR(100) UNIQUE NOT NULL,
      barcode         VARCHAR(100),
      price           DECIMAL(12,2) NOT NULL,
      sale_price      DECIMAL(12,2) NULL,
      cost_price      DECIMAL(12,2) NULL,
      stock_qty       INT DEFAULT 0,
      weight_grams    INT,
      image           VARCHAR(500),
      banner_image    VARCHAR(500),
      is_active       TINYINT(1) DEFAULT 1,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 13. variant_attribute_values
    `CREATE TABLE IF NOT EXISTS variant_attribute_values (
      variant_id        INT UNSIGNED NOT NULL,
      attribute_value_id INT UNSIGNED NOT NULL,
      PRIMARY KEY (variant_id, attribute_value_id),
      FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
      FOREIGN KEY (attribute_value_id) REFERENCES attribute_values(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 14. carts
    `CREATE TABLE IF NOT EXISTS carts (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id     INT UNSIGNED NULL UNIQUE,
      guest_token VARCHAR(100) NULL UNIQUE,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 15. cart_items
    `CREATE TABLE IF NOT EXISTS cart_items (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      cart_id     INT UNSIGNED NOT NULL,
      product_id  INT UNSIGNED NOT NULL,
      variant_id  INT UNSIGNED NULL,
      qty         INT NOT NULL DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 16. orders
    `CREATE TABLE IF NOT EXISTS orders (
      id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_number            VARCHAR(40) UNIQUE NOT NULL,
      user_id                 INT UNSIGNED NOT NULL,
      placed_by_role          ENUM('customer','retailer') DEFAULT 'customer',
      status                  ENUM('pending_approval','pending','processing','partially_shipped','shipped','delivered','cancelled','refund_requested','refunded') DEFAULT 'pending',
      shipping_name           VARCHAR(120),
      shipping_phone          VARCHAR(20),
      shipping_line1          VARCHAR(255),
      shipping_line2          VARCHAR(255),
      shipping_city           VARCHAR(100),
      shipping_state          VARCHAR(100),
      shipping_pin            VARCHAR(10),
      shipping_country        VARCHAR(80) DEFAULT 'India',
      billing_name            VARCHAR(120),
      billing_gstin           VARCHAR(20),
      subtotal                DECIMAL(12,2) NOT NULL,
      discount_amount         DECIMAL(12,2) DEFAULT 0,
      offer_id                INT UNSIGNED NULL,
      coupon_code             VARCHAR(60) NULL,
      coupon_discount         DECIMAL(12,2) DEFAULT 0,
      shipping_cost           DECIMAL(12,2) DEFAULT 0,
      tax_amount              DECIMAL(12,2) DEFAULT 0,
      grand_total             DECIMAL(12,2) NOT NULL,
      payment_method          VARCHAR(80),
      payment_gateway         VARCHAR(80),
      payment_status          ENUM('pending','paid','partially_paid','failed','refunded') DEFAULT 'pending',
      payment_ref             VARCHAR(200),
      paid_at                 DATETIME NULL,
      is_cod                  TINYINT(1) DEFAULT 0,
      affiliate_id            INT UNSIGNED NULL,
      ref_code                VARCHAR(30) NULL,
      affiliate_commission    DECIMAL(10,2) DEFAULT 0,
      reseller_proforma_sent  TINYINT(1) DEFAULT 0,
      reseller_note           TEXT,
      admin_note              TEXT,
      tracking_number         VARCHAR(200) NULL,
      tracking_carrier        VARCHAR(100) NULL,
      tracking_note           TEXT NULL,
      sms_placed              TINYINT(1) DEFAULT 0,
      sms_shipped             TINYINT(1) DEFAULT 0,
      created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (affiliate_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_user      (user_id),
      INDEX idx_status    (status),
      INDEX idx_number    (order_number),
      INDEX idx_placed_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 17. order_items
    `CREATE TABLE IF NOT EXISTS order_items (
      id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_id              INT UNSIGNED NOT NULL,
      product_id            INT UNSIGNED NOT NULL,
      variant_id            INT UNSIGNED NULL,
      product_name          VARCHAR(255) NOT NULL,
      variant_label         VARCHAR(200) NULL,
      sku                   VARCHAR(100),
      qty_ordered           INT NOT NULL,
      qty_approved          INT NULL,
      qty_rejected          INT DEFAULT 0,
      qty_shipped           INT DEFAULT 0,
      unit_price            DECIMAL(12,2) NOT NULL,
      admin_unit_price      DECIMAL(12,2) NULL,
      bulk_discount_pct     DECIMAL(6,2) DEFAULT 0,
      reseller_discount_pct DECIMAL(6,2) DEFAULT 0,
      tax_rate              DECIMAL(5,2) DEFAULT 0,
      line_total            DECIMAL(12,2) NOT NULL,
      status                ENUM('pending','approved','partially_approved','rejected','shipped','delivered','cancelled') DEFAULT 'pending',
      created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id),
      INDEX idx_order (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 18. shipments
    `CREATE TABLE IF NOT EXISTS shipments (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_id        INT UNSIGNED NOT NULL,
      shipment_number VARCHAR(60) UNIQUE NOT NULL,
      status          ENUM('pending','packed','shipped','delivered','failed') DEFAULT 'pending',
      tracking_number VARCHAR(200) NULL,
      carrier         VARCHAR(100) NULL,
      note            TEXT NULL,
      shipped_at      DATETIME NULL,
      delivered_at    DATETIME NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 19. shipment_items
    `CREATE TABLE IF NOT EXISTS shipment_items (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      shipment_id     INT UNSIGNED NOT NULL,
      order_item_id   INT UNSIGNED NOT NULL,
      qty             INT NOT NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE,
      FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
      INDEX idx_shipment (shipment_id),
      INDEX idx_order_item (order_item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 20. payment_gateways
    `CREATE TABLE IF NOT EXISTS payment_gateways (
      id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      key_name      VARCHAR(60) UNIQUE NOT NULL,
      display_name  VARCHAR(120) NOT NULL,
      is_active     TINYINT(1) DEFAULT 0,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 21. settings
    `CREATE TABLE IF NOT EXISTS settings (
      setting_key   VARCHAR(100) PRIMARY KEY,
      setting_value TEXT NOT NULL,
      setting_group VARCHAR(60) DEFAULT 'general',
      description   TEXT,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 22. sms_log
    `CREATE TABLE IF NOT EXISTS sms_log (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      phone           VARCHAR(20) NOT NULL,
      template_id     VARCHAR(100),
      message_body    TEXT NOT NULL,
      provider_job_id VARCHAR(100),
      status          ENUM('queued','sent','delivered','failed') DEFAULT 'queued',
      error_message   TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 23. sms_templates
    `CREATE TABLE IF NOT EXISTS sms_templates (
      template_id VARCHAR(100) PRIMARY KEY,
      name        VARCHAR(150) NOT NULL,
      body        TEXT NOT NULL,
      variables   JSON NOT NULL,
      is_active   TINYINT(1) DEFAULT 1,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 24. activity_log
    `CREATE TABLE IF NOT EXISTS activity_log (
      id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id        INT UNSIGNED,
      user_role      VARCHAR(50),
      user_name      VARCHAR(120),
      action         VARCHAR(100) NOT NULL,
      module         VARCHAR(60) NOT NULL,
      target_id      VARCHAR(60),
      before_state   JSON,
      after_state    JSON,
      ip_address     VARCHAR(45),
      user_agent     TEXT,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_action (action),
      INDEX idx_module (module),
      INDEX idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 25. payment_transactions
    `CREATE TABLE IF NOT EXISTS payment_transactions (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_id        INT UNSIGNED NOT NULL,
      gateway         VARCHAR(60) NOT NULL,
      transaction_id VARCHAR(200) NOT NULL,
      status          ENUM('pending','success','failed','refunded') DEFAULT 'pending',
      amount          DECIMAL(12,2) NOT NULL,
      currency        VARCHAR(10) DEFAULT 'INR',
      response_payload JSON,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      INDEX idx_order (order_id),
      INDEX idx_tx (transaction_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 26. offers
    `CREATE TABLE IF NOT EXISTS offers (
      id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name                VARCHAR(200) NOT NULL,
      description         TEXT,
      offer_type          ENUM('percent_off','flat_off','bogo','bxgy','free_product','flat_price','bundle_discount') NOT NULL,
      applies_to          ENUM('cart','product','category','brand') DEFAULT 'cart',
      product_ids         JSON,
      category_ids        JSON,
      brand_ids           JSON,
      min_cart_value      DECIMAL(12,2) DEFAULT 0,
      min_qty             INT DEFAULT 1,
      bogo_config         JSON NULL,
      discount_type       ENUM('percent','flat','free') NULL,
      discount_value      DECIMAL(12,2) DEFAULT 0,
      max_discount        DECIMAL(12,2) NULL,
      free_product_id     INT UNSIGNED NULL,
      free_qty            INT DEFAULT 0,
      user_roles          JSON DEFAULT '["customer","retailer"]',
      user_ids            JSON NULL,
      start_time          DATETIME NULL,
      end_time            DATETIME NULL,
      usage_limit         INT NULL,
      usage_count         INT DEFAULT 0,
      per_user_limit      INT DEFAULT 1,
      priority            INT DEFAULT 0,
      stackable           TINYINT(1) DEFAULT 0,
      is_active           TINYINT(1) DEFAULT 1,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_active_dates (is_active, start_time, end_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 27. coupons
    `CREATE TABLE IF NOT EXISTS coupons (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      code            VARCHAR(60) UNIQUE NOT NULL,
      discount_type   ENUM('percent','flat') NOT NULL,
      discount_value  DECIMAL(12,2) NOT NULL,
      min_cart_value  DECIMAL(12,2) DEFAULT 0,
      max_discount    DECIMAL(12,2) NULL,
      max_uses        INT NULL,
      uses_count      INT DEFAULT 0,
      per_user_limit  INT DEFAULT 1,
      user_id         INT UNSIGNED NULL,
      start_time      DATETIME NULL,
      expires_at      DATETIME NULL,
      is_active       TINYINT(1) DEFAULT 1,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 28. offer_usage
    `CREATE TABLE IF NOT EXISTS offer_usage (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      offer_id    INT UNSIGNED NULL,
      coupon_id   INT UNSIGNED NULL,
      user_id     INT UNSIGNED NOT NULL,
      order_id    INT UNSIGNED NOT NULL,
      discount_amt DECIMAL(12,2) NOT NULL,
      used_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 29. inventory_log
    `CREATE TABLE IF NOT EXISTS inventory_log (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      product_id   INT UNSIGNED NOT NULL,
      variant_id   INT UNSIGNED NULL,
      movement     ENUM('in','out','adjustment','reserved','released') NOT NULL,
      qty          INT NOT NULL,
      qty_before   INT NOT NULL,
      qty_after    INT NOT NULL,
      ref_type     VARCHAR(60),
      ref_id       INT UNSIGNED,
      note         TEXT,
      performed_by INT UNSIGNED,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      INDEX idx_product (product_id),
      INDEX idx_variant (variant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 30. low_stock_alerts
    `CREATE TABLE IF NOT EXISTS low_stock_alerts (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      product_id  INT UNSIGNED NOT NULL,
      variant_id  INT UNSIGNED NULL,
      stock_at    INT NOT NULL,
      threshold   INT NOT NULL,
      notified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved    TINYINT(1) DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 31. product_reviews
    `CREATE TABLE IF NOT EXISTS product_reviews (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      product_id   INT UNSIGNED NOT NULL,
      user_id      INT UNSIGNED NOT NULL,
      order_id     INT UNSIGNED NULL,
      rating       TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      title        VARCHAR(200),
      body         TEXT,
      images       JSON,
      status       ENUM('pending','approved','rejected') DEFAULT 'pending',
      admin_note   TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE KEY uk_user_order_product (user_id, order_id, product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 32. reseller_profiles
    `CREATE TABLE IF NOT EXISTS reseller_profiles (
      id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id           INT UNSIGNED NOT NULL UNIQUE,
      business_name     VARCHAR(200),
      gstin             VARCHAR(20),
      pan               VARCHAR(20),
      address           TEXT,
      has_special_price TINYINT(1) DEFAULT 0,
      global_discount_type  ENUM('percent','flat') NULL,
      global_discount_value DECIMAL(10,2) DEFAULT 0,
      credit_limit      DECIMAL(12,2) DEFAULT 0,
      credit_used       DECIMAL(12,2) DEFAULT 0,
      moq_override      INT NULL,
      status            ENUM('pending','approved','rejected','suspended') DEFAULT 'pending',
      applied_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      approved_at       DATETIME NULL,
      approved_by       INT UNSIGNED NULL,
      rejection_reason  TEXT NULL,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 33. product_moq
    `CREATE TABLE IF NOT EXISTS product_moq (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      product_id  INT UNSIGNED NOT NULL,
      variant_id  INT UNSIGNED NULL,
      min_qty     INT NOT NULL DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_prod_var (product_id, variant_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 34. product_bulk_pricing
    `CREATE TABLE IF NOT EXISTS product_bulk_pricing (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      product_id      INT UNSIGNED NOT NULL,
      variant_id      INT UNSIGNED NULL,
      applies_to      ENUM('customer','retailer','both') DEFAULT 'both',
      tier_type       ENUM('percent_off','flat_price','flat_off') NOT NULL,
      min_qty         INT NOT NULL,
      max_qty         INT NULL,
      value           DECIMAL(12,2) NOT NULL,
      label           VARCHAR(100),
      is_active       TINYINT(1) DEFAULT 1,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
      INDEX idx_product (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 35. reseller_product_discount
    `CREATE TABLE IF NOT EXISTS reseller_product_discount (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      reseller_id     INT UNSIGNED NOT NULL,
      product_id      INT UNSIGNED NOT NULL,
      discount_type   ENUM('percent','flat') NOT NULL,
      discount_value  DECIMAL(10,2) NOT NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_res_prod (reseller_id, product_id),
      FOREIGN KEY (reseller_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 36. reseller_approval_log
    `CREATE TABLE IF NOT EXISTS reseller_approval_log (
      id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      order_id       INT UNSIGNED NOT NULL,
      order_item_id  INT UNSIGNED NOT NULL,
      action         ENUM('approved','partially_approved','rejected') NOT NULL,
      qty_requested  INT NOT NULL,
      qty_approved   INT NOT NULL,
      admin_note     TEXT,
      approved_by    INT UNSIGNED NOT NULL,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
      FOREIGN KEY (approved_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 37. affiliate_profiles
    `CREATE TABLE IF NOT EXISTS affiliate_profiles (
      id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id               INT UNSIGNED NOT NULL UNIQUE,
      referral_code         VARCHAR(30) UNIQUE NOT NULL,
      commission_type       ENUM('percent','flat') DEFAULT 'percent',
      commission_value      DECIMAL(10,2) DEFAULT 0,
      bank_name             VARCHAR(120),
      account_number        VARCHAR(50),
      ifsc                  VARCHAR(20),
      upi_id                VARCHAR(100),
      total_clicks          INT DEFAULT 0,
      total_conversions     INT DEFAULT 0,
      total_earned          DECIMAL(12,2) DEFAULT 0,
      total_paid            DECIMAL(12,2) DEFAULT 0,
      status                ENUM('active','suspended','pending') DEFAULT 'active',
      created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 38. affiliate_commission_tiers
    `CREATE TABLE IF NOT EXISTS affiliate_commission_tiers (
      id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      affiliate_id      INT UNSIGNED NULL,
      category_id       INT UNSIGNED NULL,
      product_id        INT UNSIGNED NULL,
      commission_type   ENUM('percent','flat') NOT NULL,
      commission_value  DECIMAL(10,2) NOT NULL,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (affiliate_id) REFERENCES affiliate_profiles(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id)  REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id)   REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 39. affiliate_clicks
    `CREATE TABLE IF NOT EXISTS affiliate_clicks (
      id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      affiliate_id  INT UNSIGNED NOT NULL,
      ref_code      VARCHAR(30) NOT NULL,
      ip_address    VARCHAR(45),
      user_agent    TEXT,
      landing_url   VARCHAR(500),
      converted     TINYINT(1) DEFAULT 0,
      order_id      INT UNSIGNED NULL,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (affiliate_id) REFERENCES affiliate_profiles(id) ON DELETE CASCADE,
      INDEX idx_ref (ref_code),
      INDEX idx_aff (affiliate_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 40. affiliate_commissions
    `CREATE TABLE IF NOT EXISTS affiliate_commissions (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      affiliate_id    INT UNSIGNED NOT NULL,
      order_id        INT UNSIGNED NOT NULL,
      order_item_id   INT UNSIGNED NULL,
      amount          DECIMAL(10,2) NOT NULL,
      status          ENUM('pending','approved','paid','reversed') DEFAULT 'pending',
      payout_id       INT UNSIGNED NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (affiliate_id) REFERENCES affiliate_profiles(id),
      FOREIGN KEY (order_id)     REFERENCES orders(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 41. affiliate_payouts
    `CREATE TABLE IF NOT EXISTS affiliate_payouts (
      id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      affiliate_id    INT UNSIGNED NOT NULL,
      amount          DECIMAL(12,2) NOT NULL,
      method          ENUM('bank_transfer','upi','other') NOT NULL,
      status          ENUM('requested','processing','paid','rejected') DEFAULT 'requested',
      admin_note      TEXT,
      processed_by    INT UNSIGNED NULL,
      processed_at    DATETIME NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (affiliate_id) REFERENCES affiliate_profiles(id),
      FOREIGN KEY (processed_by)  REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 42. shipping_presets
    `CREATE TABLE IF NOT EXISTS shipping_presets (
      id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      label         VARCHAR(120) NOT NULL,
      description   VARCHAR(255),
      cost          DECIMAL(10,2) NOT NULL,
      estimated_days VARCHAR(40),
      is_active     TINYINT(1) DEFAULT 1,
      sort_order    INT DEFAULT 0,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 43. wishlists
    `CREATE TABLE IF NOT EXISTS wishlists (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id     INT UNSIGNED NOT NULL,
      product_id  INT UNSIGNED NOT NULL,
      variant_id  INT UNSIGNED NULL,
      added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_product (user_id, product_id),
      FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 44. recently_viewed
    `CREATE TABLE IF NOT EXISTS recently_viewed (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id     INT UNSIGNED NOT NULL,
      product_id  INT UNSIGNED NOT NULL,
      viewed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_product (user_id, product_id),
      FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 45. seo_pages
    `CREATE TABLE IF NOT EXISTS seo_pages (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      page_key    VARCHAR(120) UNIQUE NOT NULL,
      title       VARCHAR(200),
      description VARCHAR(400),
      og_image    VARCHAR(500),
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 46. badges
    `CREATE TABLE IF NOT EXISTS badges (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name        VARCHAR(100) NOT NULL,
      badge_text  VARCHAR(100) NOT NULL,
      bg_color    VARCHAR(30) DEFAULT '#ef4444',
      text_color  VARCHAR(30) DEFAULT '#ffffff',
      icon        VARCHAR(100) NULL,
      description TEXT NULL,
      is_active   TINYINT(1) DEFAULT 1,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    // 47. product_badges
    `CREATE TABLE IF NOT EXISTS product_badges (
      product_id INT UNSIGNED NOT NULL,
      badge_id   INT UNSIGNED NOT NULL,
      PRIMARY KEY (product_id, badge_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE,
      INDEX idx_badge (badge_id),
      INDEX idx_product (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  ];

  for (const sql of tables) {
    await connection.query(sql);
  }
  try {
    await connection.query('ALTER TABLE orders ADD COLUMN ref_code VARCHAR(30) NULL');
  } catch (e) {
    // Ignore if column already exists
  }
  try {
    await connection.query('ALTER TABLE users ADD COLUMN segment_tags JSON NULL');
  } catch (e) {
    // Ignore if column already exists
  }
  console.log(`[DB Init] All ${tables.length} tables verified/created successfully.`);

  // Seed default settings per §2.11
  const defaultSettings = [
    ['store_name', 'WePrixe Store', 'general', 'Public store name'],
    ['store_email', 'support@weprixe.com', 'general', 'Store contact email'],
    ['currency_symbol', '₹', 'general', 'Default currency symbol'],
    ['cod_enabled', '1', 'payment', 'Cash on delivery enable toggle'],
    ['shipping_cost_default', '50.00', 'shipping', 'Default shipping charge'],
    ['free_shipping_threshold', '999.00', 'shipping', 'Order subtotal threshold for free shipping'],
    ['shipping_applies_to', 'customer_only', 'shipping', 'Whether shipping applies to customer_only or all'],
    ['low_stock_threshold_global', '5', 'inventory', 'Default threshold for low stock alert'],
    ['affiliate_cookie_days', '30', 'affiliate', 'Referral attribution cookie duration in days'],
    ['affiliate_default_commission_pct', '5.00', 'affiliate', 'Default affiliate commission percentage'],
    ['reseller_order_approval', '1', 'reseller', 'Require admin approval for reseller orders']
  ];

  for (const [key, val, group, desc] of defaultSettings) {
    await connection.query(
      `INSERT INTO settings (setting_key, setting_value, setting_group, description)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description);`,
      [key, val, group, desc]
    );
  }
  console.log('[DB Init] Default settings seeded.');

  // Seed SMS templates per §2.11
  const defaultTemplates = [
    ['order_placed', 'Order Placed', 'Hi {{name}}, your order {{order_number}} for {{amount}} has been received! Track at {{link}}', JSON.stringify(['name', 'order_number', 'amount', 'link'])],
    ['order_shipped', 'Order Shipped', 'Hi {{name}}, order {{order_number}} is shipped via {{carrier}}, tracking: {{tracking_number}}', JSON.stringify(['name', 'order_number', 'carrier', 'tracking_number'])],
    ['order_delivered', 'Order Delivered', 'Hi {{name}}, order {{order_number}} has been delivered. Thank you for shopping with us!', JSON.stringify(['name', 'order_number'])],
    ['otp_login', 'Login OTP', 'Your login OTP for WePrixe is {{otp}}. Valid for 10 minutes.', JSON.stringify(['otp'])],
    ['otp_verify', 'Verify Phone OTP', 'Your phone verification OTP is {{otp}}. Valid for 10 minutes.', JSON.stringify(['otp'])],
    ['stock_low', 'Low Stock Alert', 'ALERT: Product {{product_name}} (SKU: {{sku}}) is low on stock: {{qty}} remaining.', JSON.stringify(['product_name', 'sku', 'qty'])],
    ['reseller_approval', 'Reseller Application Approved', 'Congratulations {{name}}! Your reseller account has been approved. Log in to see wholesale pricing.', JSON.stringify(['name'])],
    ['order_approved', 'Reseller Order Approved', 'Hi {{name}}, your order {{order_number}} has been reviewed. Items approved: {{items_summary}}', JSON.stringify(['name', 'order_number', 'items_summary'])]
  ];

  for (const [id, name, body, vars] of defaultTemplates) {
    await connection.query(
      `INSERT INTO sms_templates (template_id, name, body, variables)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), body = VALUES(body), variables = VALUES(variables);`,
      [id, name, body, vars]
    );
  }
  console.log('[DB Init] Default SMS templates seeded.');

  await connection.end();
  console.log('[DB Init] Database initialization complete!');
}

if (require.main === module) {
  initDb().catch((err) => {
    console.error('[DB Init Error]:', err);
    process.exit(1);
  });
}

module.exports = initDb;
