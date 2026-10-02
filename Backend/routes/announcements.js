const express = require('express');
const router = express.Router();
const { query } = require('../database');

// Ensure database tables exist automatically on route import
async function initTables() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS announcements (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                content TEXT NOT NULL,
                category VARCHAR(100) DEFAULT 'Campus News',
                target_audience VARCHAR(50) DEFAULT 'all',
                is_urgent BOOLEAN DEFAULT false,
                is_banner BOOLEAN DEFAULT true,
                starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id SERIAL PRIMARY KEY,
                endpoint TEXT UNIQUE NOT NULL,
                keys_p256dh TEXT,
                keys_auth TEXT,
                user_role VARCHAR(50) DEFAULT 'guest',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Insert default welcome/announcement if empty
        const { rows } = await query(`SELECT COUNT(*) FROM announcements`);
        if (parseInt(rows[0].count) === 0) {
            await query(`
                INSERT INTO announcements (title, content, category, target_audience, is_urgent, is_banner)
                VALUES 
                ('Welcome to Baidoa Bedrock ICT Campus Portal', 'Stay tuned for academic updates, exam timetables, fee notices, and digital library resources directly on your device.', 'Campus News', 'all', false, true),
                ('Academic Calendar & Digital Library Access', 'All students can now access digital textbooks and study resources through the Digital Library Portal.', 'Academic', 'students', true, true);
            `);
        }
    } catch (e) {
        console.warn('Announcements table init warning:', e.message);
    }
}
initTables();

// GET active announcements for pre-app splash screen & notification popup
router.get('/active', async (req, res) => {
    try {
        const { target = 'all' } = req.query;
        const { rows } = await query(`
            SELECT * FROM announcements 
            WHERE (target_audience = 'all' OR target_audience = $1)
              AND (expires_at IS NULL OR expires_at >= NOW())
            ORDER BY is_urgent DESC, created_at DESC 
            LIMIT 10
        `, [target]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET all announcements (Admin list)
router.get('/all', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM announcements ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create a new announcement / pre-app news item
router.post('/', async (req, res) => {
    try {
        const { title, content, category, target_audience, is_urgent, is_banner, expires_at } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required' });
        }

        const expiry = expires_at ? new Date(expires_at) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const { rows } = await query(`
            INSERT INTO announcements 
            (title, content, category, target_audience, is_urgent, is_banner, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            title.trim(),
            content.trim(),
            category || 'Campus News',
            target_audience || 'all',
            !!is_urgent,
            is_banner !== false,
            expiry
        ]);

        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE announcement
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query(`DELETE FROM announcements WHERE id = $1`, [id]);
        res.json({ message: 'Announcement deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST register Web Push subscription token
router.post('/subscribe', async (req, res) => {
    try {
        const { endpoint, keys, user_role } = req.body;
        if (!endpoint) {
            return res.status(400).json({ error: 'Endpoint is required' });
        }

        const p256dh = keys ? keys.p256dh : '';
        const auth = keys ? keys.auth : '';

        await query(`
            INSERT INTO push_subscriptions (endpoint, keys_p256dh, keys_auth, user_role)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (endpoint) DO UPDATE 
            SET keys_p256dh = EXCLUDED.keys_p256dh,
                keys_auth = EXCLUDED.keys_auth,
                user_role = EXCLUDED.user_role
        `, [endpoint, p256dh, auth, user_role || 'guest']);

        res.json({ success: true, message: 'Web Push Subscription registered.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
