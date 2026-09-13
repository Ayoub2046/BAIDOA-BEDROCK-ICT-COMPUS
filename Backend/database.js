// backend/database.js
// PostgreSQL connection via Supabase - reads from existing tables

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,                        // Very conservative: prevents EMAXCONNSESSION on Supabase session mode
    min: 0,                        // Don't hold idle connections
    idleTimeoutMillis: 2000,       // Release idle connections quickly back to Supabase
    connectionTimeoutMillis: 15000, // Wait up to 15s for a free slot before failing
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

// Robust query helper with automatic exponential backoff retry
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
        if (isTransient && retryCount < 4) {
            const delay = Math.pow(2, retryCount) * 500; // 500ms, 1s, 2s, 4s
            console.warn(`DB retry [${retryCount + 1}/4] in ${delay}ms: ${msg.substring(0, 80)}`);
            await new Promise(r => setTimeout(r, delay));
            return await query(text, params, retryCount + 1);
        }
        throw err;
    }
};

module.exports = { query, pool };