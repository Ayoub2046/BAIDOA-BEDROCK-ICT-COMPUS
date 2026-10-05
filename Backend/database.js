// backend/database.js
// PostgreSQL connection via Supabase - reads from existing tables

require('dotenv').config();
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,                       // Expanded pool size for Vercel serverless concurrency
    min: 0,                        // Don't hold idle connections
    idleTimeoutMillis: 3000,       // Release idle connections quickly back to Supabase
    connectionTimeoutMillis: 4000, // Fail fast in 4s to prevent Vercel HTTP2 timeouts
    allowExitOnIdle: true
});

pool.on('error', (err) => {
    // Swallow non-critical idle client errors silently
    if (!err.message.includes('terminated') && !err.message.includes('timeout')) {
        console.warn('Supabase pool error:', err.message);
    }
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to Supabase:', err.message);
    } else {
        console.log('Connected to Supabase PostgreSQL.');
        release();
    }
});

// Robust query helper with fast single retry for transient drops
const query = async (text, params, retryCount = 0) => {
    try {
        return await pool.query(text, params);
    } catch (err) {
        const msg = String(err.message || '');
        const isTransient = msg.includes('terminated') ||
                            msg.includes('timeout') ||
                            msg.includes('closed') ||
                            msg.includes('ECONNRESET') ||
                            msg.includes('EMAXCONNSESSION') ||
                            msg.includes('max clients reached') ||
                            msg.includes('Connection') ||
                            msg.includes('connect');
        if (isTransient && retryCount < 1) {
            console.warn(`DB fast retry [1/1] in 300ms: ${msg.substring(0, 80)}`);
            await new Promise(r => setTimeout(r, 300));
            return await pool.query(text, params);
        }
        throw err;
    }
};

module.exports = { query, pool };