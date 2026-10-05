// backend/database.js
// PostgreSQL connection via Supabase - reads from existing tables

require('dotenv').config();
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,                        // Expanded pool size for Vercel serverless concurrency
    min: 1,                         // Keep at least 1 warm connection so first query is instant
    idleTimeoutMillis: 30000,       // Release idle connections after 30s
    connectionTimeoutMillis: 10000, // 10s connection timeout for Supabase TLS handshake
    allowExitOnIdle: true
});

pool.on('error', (err) => {
    // Swallow non-critical idle client errors silently
    if (!err.message.includes('terminated') && !err.message.includes('timeout')) {
        console.warn('Supabase pool error:', err.message);
    }
});

// Eager warm-up: fire a simple SELECT at startup so the TCP/TLS handshake
// completes BEFORE the first real user request arrives — eliminates 30-45s cold start
pool.query('SELECT 1').then(() => {
    console.log('[DB] Connection pool warmed up successfully.');
}).catch(err => {
    console.warn('[DB] Warm-up ping failed (will retry on first request):', err.message);
});

// Robust query helper with fast retry for transient drops
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
        if (isTransient && retryCount < 2) {
            console.warn(`DB retry [${retryCount + 1}/2] in 400ms: ${msg.substring(0, 80)}`);
            await new Promise(r => setTimeout(r, 400));
            return await pool.query(text, params);
        }
        throw err;
    }
};

module.exports = { query, pool };