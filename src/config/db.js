const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'ecom_vishal',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  namedPlaceholders: true
});

async function query(sql, params = []) {
  try {
    const sanitizedParams = Array.isArray(params)
      ? params.map((p) => (p === undefined ? null : p))
      : params;
    const [results] = await pool.execute(sql, sanitizedParams);
    return results;
  } catch (error) {
    console.error('Database query error:', error.message, '\nSQL:', sql);
    throw error;
  }
}

module.exports = {
  pool,
  query
};
