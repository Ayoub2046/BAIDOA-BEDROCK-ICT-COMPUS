const {query} = require('./database.js');
query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name").then(r => { r.rows.forEach(t => console.log(t.table_name)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
