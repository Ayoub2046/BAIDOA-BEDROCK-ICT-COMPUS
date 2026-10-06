// backend/database.js
// PostgreSQL connection via Supabase - reads from existing tables

require('dotenv').config();
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

const poolConfig = {
    ssl: { rejectUnauthorized: false },
    max: 10,
    min: 0,                          // MUST BE 0 on serverless so pool doesn't block container freeze/exit
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,  // 15s connection timeout
    statement_timeout: 25000,
    allowExitOnIdle: true
};

if (dbUrl) {
    poolConfig.connectionString = dbUrl;
} else {
    console.warn('[DB] WARNING: Neither DATABASE_URL nor SUPABASE_DB_URL is defined. Please set environment variables on Vercel.');
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    // Swallow pool errors gracefully to prevent uncaughtException crash on serverless
    console.warn('[DB Pool Error]', err ? (err.message || err) : 'Unknown pool error');
});

// Warm-up ping (only if connection string exists)
if (dbUrl) {
    pool.query('SELECT 1').then(() => {
        console.log('[DB] Connection pool warmed up successfully.');
    }).catch(err => {
        console.warn('[DB] Warm-up ping failed (will retry on first request):', err.message);
    });
}

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