require('dotenv').config();
const {query} = require('./database.js');
(async () => {
  const r = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  r.rows.forEach(t => console.log(t.table_name));
  const c = await query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name NOT LIKE 'pg_%' ORDER BY table_name, ordinal_position");
  c.rows.forEach(col => console.log(col.table_name + ' -> ' + col.column_name));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
