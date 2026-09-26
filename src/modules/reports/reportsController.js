const { query } = require('../../config/db');

class ReportsController {
  /**
   * GET /admin/reports/dashboard — Executive KPI Summary
   */
  async getDashboardKPIs(req, res, next) {
    try {
      const gmvRes = await query(`SELECT SUM(grand_total) AS gmv, COUNT(*) AS total_orders FROM orders WHERE status != 'cancelled'`);
      const usersRes = await query(`SELECT COUNT(*) AS total_customers FROM users WHERE role = 'customer' AND deleted_at IS NULL`);
      const resellerRes = await query(`SELECT COUNT(*) AS total_resellers FROM reseller_profiles WHERE status = 'active'`);
      
      const topProducts = await query(
        `SELECT oi.product_name, oi.product_id, SUM(oi.qty_ordered) AS units_sold, SUM(oi.line_total) AS total_revenue
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE o.status != 'cancelled'
         GROUP BY oi.product_id, oi.product_name
         ORDER BY total_revenue DESC
         LIMIT 5`
      );

      res.json({
        success: true,
        data: {
          gmv: parseFloat(gmvRes[0]?.gmv || 0),
          total_orders: parseInt(gmvRes[0]?.total_orders || 0, 10),
          total_customers: parseInt(usersRes[0]?.total_customers || 0, 10),
          total_resellers: parseInt(resellerRes[0]?.total_resellers || 0, 10),
          top_products: topProducts || []
        },
        message: 'Executive dashboard KPIs retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/reports/sales — Date range sales report
   */
  async getSalesReport(req, res, next) {
    try {
      const { start_date, end_date } = req.query;
      let whereClause = "WHERE status != 'cancelled'";
      const params = [];

      if (start_date) {
        whereClause += ' AND created_at >= ?';
        params.push(start_date);
      }
      if (end_date) {
        whereClause += ' AND created_at <= ?';
        params.push(end_date + ' 23:59:59');
      }

      const salesSummary = await query(
        `SELECT 
           COUNT(*) AS total_orders,
           SUM(subtotal) AS gross_subtotal,
           SUM(discount_amount + coupon_discount) AS total_discounts,
           SUM(shipping_cost) AS total_shipping,
           SUM(tax_amount) AS total_tax,
           SUM(grand_total) AS net_gmv
         FROM orders ${whereClause}`,
        params
      );

      const dailyBreakdown = await query(
        `SELECT 
           DATE(created_at) AS date,
           COUNT(*) AS orders_count,
           SUM(grand_total) AS daily_revenue
         FROM orders ${whereClause}
         GROUP BY DATE(created_at)
         ORDER BY date DESC
         LIMIT 30`,
        params
      );

      res.json({
        success: true,
        data: {
          summary: {
            total_orders: parseInt(salesSummary[0]?.total_orders || 0, 10),
            gross_subtotal: parseFloat(salesSummary[0]?.gross_subtotal || 0),
            total_discounts: parseFloat(salesSummary[0]?.total_discounts || 0),
            total_shipping: parseFloat(salesSummary[0]?.total_shipping || 0),
            total_tax: parseFloat(salesSummary[0]?.total_tax || 0),
            net_gmv: parseFloat(salesSummary[0]?.net_gmv || 0)
          },
          daily_breakdown: dailyBreakdown || []
        },
        message: 'Sales report retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/reports/orders — Order breakdown by status
   */
  async getOrderReport(req, res, next) {
    try {
      const breakdown = await query(
        `SELECT status, COUNT(*) AS count, SUM(grand_total) AS total_value
         FROM orders
         GROUP BY status`
      );

      res.json({
        success: true,
        data: breakdown || [],
        message: 'Orders breakdown by status retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/reports/products — Product performance report
   */
  async getProductReport(req, res, next) {
    try {
      const performance = await query(
        `SELECT p.id, p.name, p.sku, p.base_price, p.stock_qty,
                COALESCE(SUM(oi.qty_ordered), 0) AS total_units_sold,
                COALESCE(SUM(oi.line_total), 0) AS total_revenue
         FROM products p
         LEFT JOIN order_items oi ON p.id = oi.product_id
         WHERE p.deleted_at IS NULL
         GROUP BY p.id, p.name, p.sku, p.base_price, p.stock_qty
         ORDER BY total_revenue DESC`
      );

      res.json({
        success: true,
        data: performance || [],
        message: 'Product performance report retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/reports/customers — Customer LTV report
   */
  async getCustomerReport(req, res, next) {
    try {
      const customers = await query(
        `SELECT u.id, u.name, u.email, u.phone, u.role, u.created_at,
                COUNT(o.id) AS total_orders,
                COALESCE(SUM(o.grand_total), 0) AS lifetime_value
         FROM users u
         LEFT JOIN orders o ON u.id = o.user_id AND o.status != 'cancelled'
         WHERE u.role IN ('customer', 'retailer') AND u.deleted_at IS NULL
         GROUP BY u.id, u.name, u.email, u.phone, u.role, u.created_at
         ORDER BY lifetime_value DESC
         LIMIT 50`
      );

      res.json({
        success: true,
        data: customers || [],
        message: 'Customer performance and LTV report retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/reports/affiliates — Affiliate network performance report
   */
  async getAffiliateReport(req, res, next) {
    try {
      const affiliates = await query(
        `SELECT ap.*, u.name AS full_name, u.email
         FROM affiliate_profiles ap
         JOIN users u ON ap.user_id = u.id
         ORDER BY ap.total_earned DESC`
      );

      res.json({
        success: true,
        data: affiliates || [],
        message: 'Affiliate network report retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/reports/inventory — Catalog valuation report
   */
  async getInventoryReport(req, res, next) {
    try {
      const summary = await query(
        `SELECT 
           COUNT(*) AS total_products,
           SUM(stock_qty) AS total_units_in_stock,
           SUM(stock_qty * base_price) AS total_inventory_valuation,
           SUM(CASE WHEN stock_qty <= low_stock_threshold THEN 1 ELSE 0 END) AS low_stock_count,
           SUM(CASE WHEN stock_qty = 0 THEN 1 ELSE 0 END) AS out_of_stock_count
         FROM products
         WHERE deleted_at IS NULL AND is_active = 1`
      );

      res.json({
        success: true,
        data: {
          total_products: parseInt(summary[0]?.total_products || 0, 10),
          total_units: parseInt(summary[0]?.total_units_in_stock || 0, 10),
          valuation: parseFloat(summary[0]?.total_inventory_valuation || 0),
          low_stock_count: parseInt(summary[0]?.low_stock_count || 0, 10),
          out_of_stock_count: parseInt(summary[0]?.out_of_stock_count || 0, 10)
        },
        message: 'Inventory valuation report retrieved.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/reports/sales/export — Export sales CSV
   */
  async exportSalesReport(req, res, next) {
    try {
      const orders = await query(
        `SELECT order_number, created_at, shipping_name, status, subtotal, shipping_cost, tax_amount, grand_total
         FROM orders
         ORDER BY id DESC`
      );

      let csv = 'Order Number,Date,Customer,Status,Subtotal,Shipping,Tax,Grand Total\n';
      for (const o of (orders || [])) {
        const dateStr = new Date(o.created_at).toISOString().split('T')[0];
        csv += `"${o.order_number}","${dateStr}","${o.shipping_name || ''}","${o.status}",${o.subtotal},${o.shipping_cost},${o.tax_amount},${o.grand_total}\n`;
      }

      res.header('Content-Type', 'text/csv');
      res.attachment('sales_report.csv');
      res.send(csv);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReportsController();
