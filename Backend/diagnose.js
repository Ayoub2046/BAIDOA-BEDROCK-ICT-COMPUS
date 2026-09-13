// Direct Supabase diagnostic - run with: node diagnose.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function diagnose() {
    const client = await pool.connect();
    try {
        console.log('\n✅ Connected to Supabase!\n');

        // 1. List ALL tables and their row counts
        const { rows: tables } = await client.query(`
            SELECT 
                schemaname,
                tablename,
                (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', schemaname, tablename), FALSE, TRUE, '')))[1]::text::int AS row_count
            FROM pg_tables
            WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY schemaname, tablename
        `);

        console.log('📋 ALL TABLES IN YOUR DATABASE:');
        console.log('================================');
        if (tables.length === 0) {
            console.log('❌ NO TABLES FOUND AT ALL!');
        } else {
            tables.forEach(t => {
                const icon = t.row_count > 0 ? '✅' : '⚠️ ';
                console.log(`${icon} [${t.schemaname}] ${t.tablename}: ${t.row_count} rows`);
            });
        }

        // 2. Check current database and user
        const { rows: info } = await client.query(`
            SELECT current_database() as db, current_user as usr, current_schema() as schema
        `);
        console.log('\n🔌 CONNECTION INFO:');
        console.log('================================');
        console.log(`Database: ${info[0].db}`);
        console.log(`User:     ${info[0].usr}`);
        console.log(`Schema:   ${info[0].schema}`);

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        client.release();
        pool.end();
    }
}

diagnose();
