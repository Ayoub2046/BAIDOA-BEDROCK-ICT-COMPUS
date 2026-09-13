const { query } = require('./database.js');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, '..', 'uploads', 'images');

function fileExists(url) {
    if (!url) return false;
    const filename = url.replace(/^\/uploads\/images\//, '');
    if (filename === url) return true;
    return fs.existsSync(path.join(uploadsDir, filename));
}

async function cleanContentTable() {
    const { rows } = await query(`SELECT * FROM content WHERE key = 'heroGallery' OR key = 'heroBg' OR key = 'about_mainImage'`);
    for (const row of rows) {
        if (row.key === 'heroGallery') {
            try {
                const urls = JSON.parse(row.value || '[]');
                const filtered = urls.filter(u => fileExists(u));
                if (filtered.length !== urls.length) {
                    await query(`UPDATE content SET value = $1 WHERE key = 'heroGallery'`, [JSON.stringify(filtered)]);
                    console.log(`heroGallery: removed ${urls.length - filtered.length} stale image(s)`);
                }
            } catch {}
        } else {
            if (!fileExists(row.value)) {
                await query(`UPDATE content SET value = '' WHERE key = $1`, [row.key]);
                console.log(`${row.key}: removed stale image`);
            }
        }
    }
}

async function cleanNewsTable() {
    const { rows } = await query(`SELECT id, imageurl FROM news WHERE imageurl IS NOT NULL AND imageurl != ''`);
    for (const row of rows) {
        if (!fileExists(row.imageurl)) {
            await query(`UPDATE news SET imageurl = NULL WHERE id = $1`, [row.id]);
            console.log(`news id=${row.id}: removed stale image`);
        }
    }
}

async function main() {
    console.log('Cleaning stale image references...');
    await cleanContentTable();
    await cleanNewsTable();
    console.log('Done.');
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
