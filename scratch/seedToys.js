require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query } = require('../src/config/db');
const StorageService = require('../src/utils/bunnyUpload');

async function seed() {
  try {
    const rcCarImagePath = '/Users/darksoul/.gemini/antigravity/brain/ff6529a0-a929-40d3-bb64-a6d09494fb53/rc_car_1790409155961.jpg';
    const heroBannerPath = '/Users/darksoul/.gemini/antigravity/brain/ff6529a0-a929-40d3-bb64-a6d09494fb53/hero_banner_1790409173201.jpg';

    // 1. Upload images
    let rcCarUrl = '';
    let heroBannerUrl = '';

    if (fs.existsSync(rcCarImagePath)) {
      const buffer = fs.readFileSync(rcCarImagePath);
      const filename = `rc_car_${Date.now()}.jpg`;
      rcCarUrl = await StorageService.uploadToBunny(filename, buffer, 'image/jpeg');
      console.log('RC Car uploaded:', rcCarUrl);
    }

    if (fs.existsSync(heroBannerPath)) {
      const buffer = fs.readFileSync(heroBannerPath);
      const filename = `hero_banner_${Date.now()}.jpg`;
      heroBannerUrl = await StorageService.uploadToBunny(filename, buffer, 'image/jpeg');
      console.log('Hero Banner uploaded:', heroBannerUrl);
    }

    // 2. Insert dummy toys
    const products = [
      {
        sku: 'RC-101',
        name: 'High Performance RC Monster Truck',
        slug: 'high-performance-rc-monster-truck',
        base_price: 2499,
        sale_price: 1999,
        stock_qty: 50,
        image: rcCarUrl
      },
      {
        sku: 'RC-102',
        name: 'Drift Racing Car',
        slug: 'drift-racing-car',
        base_price: 1599,
        sale_price: 1299,
        stock_qty: 30,
        image: rcCarUrl
      },
      {
        sku: 'RC-103',
        name: 'Amphibious RC Car Land & Water',
        slug: 'amphibious-rc-car-land-water',
        base_price: 3499,
        sale_price: 2999,
        stock_qty: 20,
        image: rcCarUrl
      }
    ];

    for (const p of products) {
      const result = await query(
        `INSERT INTO products (sku, name, slug, base_price, sale_price, stock_qty, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE name=VALUES(name), base_price=VALUES(base_price), sale_price=VALUES(sale_price)`,
        [p.sku, p.name, p.slug, p.base_price, p.sale_price, p.stock_qty]
      );
      
      const productId = result.insertId || result.updateId;
      if (productId && p.image) {
        // Just checking if we can update the main image (or use product_images)
        // Usually, there's a primary image or it goes into product_images
        await query('INSERT INTO product_images (product_id, url, is_primary) VALUES (?, ?, 1)', [productId, p.image]);
        console.log(`Inserted product ${p.name} with ID ${productId}`);
      }
    }
    console.log('Done!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding toys:', err);
    process.exit(1);
  }
}

seed();
