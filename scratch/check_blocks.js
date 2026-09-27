const { query } = require('../src/config/db');

async function run() {
  const res = await query("SELECT id, config_data FROM homepage_sections WHERE type = 'custom_block'");
  console.log(JSON.stringify(res, null, 2));
  process.exit();
}
run();
