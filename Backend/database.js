// backend/database.js
// PostgreSQL connection via Supabase - reads from existing tables

require('dotenv').config();
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,                         // Pool size for Vercel serverless concurrency
    min: 2,                          // Keep 2 warm connections to reduce cold-start latency
    idleTimeoutMillis: 60000,        // Release idle connections after 60s
    connectionTimeoutMillis: 20000,  // 20s for Supabase TLS handshake (up from 10s)
    statement_timeout: 25000,        // Kill queries that run >25s (prevents infinite hangs)
    allowExitOnIdle: true,
    keepAlive: true,                 // TCP keep-alive to prevent Supabase from closing idle sockets
    keepAliveInitialDelayMillis: 10000
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