require('dotenv').config();
const app = require('./app');
const initDb = require('./config/initDb');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    console.log('[Server Startup] Initializing Database Schema...');
    await initDb();

    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(` E-Commerce Platform API Server running on port ${PORT}`);
      console.log(` API Base URL: http://localhost:${PORT}/api/v1`);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error('[Server Startup Failure]:', error);
    process.exit(1);
  }
}

startServer();
