const { query } = require('./Backend/database.js');
const bcrypt = require('./node_modules/bcrypt');
const pws = ['admin','Admin','admin123','Admin123','password','bedrock','Bedrock','bedrock123','Bedrock123','baidoa','Baidoa','ict','ICT','12345678','123456'];
query("SELECT id, name, email, password FROM users WHERE role='Admin' AND deleted_at IS NULL").then(async r => {
  for (const a of r.rows) {
    console.log('Admin:', a.name, a.email);
    console.log('Hash preview:', a.password ? a.password.substring(0,30)+'...' : 'NULL');
    const isBcrypt = a.password && (a.password.startsWith('$2b$') || a.password.startsWith('$2a$'));
    if (isBcrypt) {
      let found = false;
      for (const pw of pws) {
        try { if(await bcrypt.compare(pw, a.password)) { console.log('MATCH:', pw); found = true; } } catch(e){}
      }
      if(!found) console.log('NO MATCH from test list');
    } else if (a.password) {
      console.log('PLAINTEXT:', a.password);
    }
  }
  process.exit();
}).catch(e => { console.error(e.message); process.exit(1); });
