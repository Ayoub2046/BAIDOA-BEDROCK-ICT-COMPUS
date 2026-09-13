require('dotenv').config({path: require('path').join(__dirname, '.env')});
const {query} = require('./database');
const fs = require('fs');
const path = require('path');
(async () => {
  const r = await query("SELECT key, value FROM content WHERE key IN ('heroBg','heroGallery')");
  for (const row of r.rows) {
    if (row.key === 'heroBg' && row.value) {
      const filePath = path.join(__dirname, '..', row.value);
      if (!fs.existsSync(filePath)) {
        await query("UPDATE content SET value = '' WHERE key = 'heroBg'");
        console.log('Cleared stale heroBg');
      }
    } else if (row.key === 'heroGallery' && row.value) {
      try {
        const urls = JSON.parse(row.value);
        const valid = urls.filter(u => fs.existsSync(path.join(__dirname, '..', u)));
        if (valid.length !== urls.length) {
          await query("UPDATE content SET value =  WHERE key = 'heroGallery'", [JSON.stringify(valid)]);
          console.log('Cleaned heroGallery: removed ' + (urls.length-valid.length) + ' missing file(s)');
        }
      } catch(e) { console.log('heroGallery parse error:', e.message); }
    }
  }
  console.log('Done');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
