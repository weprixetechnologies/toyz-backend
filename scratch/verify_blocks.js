const { query } = require('../src/config/db');

async function check() {
  const data = await query("SELECT id, config_data FROM homepage_sections WHERE type = 'custom_block'");
  console.log("Raw from DB:");
  data.forEach(d => {
    console.log("Section", d.id);
    let parsed;
    try {
      parsed = typeof d.config_data === 'string' ? JSON.parse(d.config_data) : d.config_data;
      console.log(JSON.stringify(parsed, null, 2));
    } catch(e) {
      console.log("Parse Error:", e.message);
    }
  });
  process.exit();
}
check();
