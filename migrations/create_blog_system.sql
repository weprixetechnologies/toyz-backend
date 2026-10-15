-- =====================================================================
-- ToyWorld Blog System & Newsletter Database Migration
-- Target Database: MySQL 8.0+ / MariaDB 10.4+
-- Description: Creates blog_categories, blogs, and newsletter_subscribers tables
--              and seeds initial default categories.
-- =====================================================================

-- 1. BLOG CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS blog_categories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  slug        VARCHAR(120) NOT NULL UNIQUE,
  icon        VARCHAR(50) DEFAULT 'Tag',
  sort_order  INT DEFAULT 0,
  is_active   TINYINT(1) DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. BLOGS TABLE
CREATE TABLE IF NOT EXISTS blogs (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title           VARCHAR(255) NOT NULL,
  slug            VARCHAR(191) UNIQUE NOT NULL,
  excerpt         TEXT,
  content         LONGTEXT NOT NULL,
  featured_image  VARCHAR(500),
  category_name   VARCHAR(100) NOT NULL DEFAULT 'General',
  category_slug   VARCHAR(120) NOT NULL DEFAULT 'general',
  author_name     VARCHAR(120) NOT NULL DEFAULT 'ToyWorld Team',
  reading_time    VARCHAR(30) DEFAULT '5 min read',
  views_count     INT UNSIGNED DEFAULT 0,
  is_published    TINYINT(1) DEFAULT 1,
  published_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  meta_title      VARCHAR(200),
  meta_desc       VARCHAR(400),
  og_image        VARCHAR(500),
  canonical_url   VARCHAR(500),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_slug (slug),
  INDEX idx_pub (is_published, published_at),
  INDEX idx_cat (category_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. NEWSLETTER SUBSCRIBERS TABLE
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(191) NOT NULL UNIQUE,
  status      ENUM('subscribed','unsubscribed') DEFAULT 'subscribed',
  source      VARCHAR(100) DEFAULT 'blog_sidebar',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- SEED INITIAL BLOG CATEGORIES
-- =====================================================================
INSERT INTO blog_categories (name, slug, icon, sort_order, is_active)
VALUES
  ('RC Cars', 'rc-cars', 'Car', 1, 1),
  ('Toy Guides', 'toy-guides', 'Compass', 2, 1),
  ('Play Ideas', 'play-ideas', 'Sparkles', 3, 1),
  ('Parent Tips', 'parent-tips', 'Heart', 4, 1),
  ('Educational Toys', 'educational-toys', 'BookOpen', 5, 1),
  ('News & Updates', 'news-updates', 'Bell', 6, 1)
ON DUPLICATE KEY UPDATE
  icon = VALUES(icon),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);
