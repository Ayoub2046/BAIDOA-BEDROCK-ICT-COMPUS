// Backend/run-schema.js
// Executes schema.sql against the configured Supabase PostgreSQL database
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    console.log('Connecting to Supabase...');
    try {
        const client = await pool.connect();
        console.log('Connected! Reading schema.sql...');
        const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        
        console.log('Executing schema.sql statements...');
        await client.query(sql);
        console.log('SUCCESS: All schema tables, indexes, triggers, and seed data applied successfully!');
        
        // Query the list of tables
        const tablesRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);
        console.log('\nCreated tables (' + tablesRes.rows.length + '):');
        console.log(tablesRes.rows.map(r => r.table_name).join(', '));
        
        client.release();
    } catch (err) {
        console.error('Error applying schema:', err.message);
        if (err.position) {
            console.error('Error position:', err.position);
        }
    } finally {
        await pool.end();
    }
}

run();
