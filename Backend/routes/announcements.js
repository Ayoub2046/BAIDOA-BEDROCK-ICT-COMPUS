const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const webPush = require('web-push');
const { query } = require('../database');

// Load or initialize VAPID Keys
let vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY || "BH1CsgBgAM7tZxZGeTEwDD7CUshgolUrDEUB4q6k9KLPAS_NqFvRvgVC_1ts1bLk8r30SgQd_aDa5uyodbOvdtw",
    privateKey: process.env.VAPID_PRIVATE_KEY || "oPT95bXFC4NBb4HEOH6HSN4mtiZ260GmFQ8SD1nUDho"
};

const vapidFile = path.join(__dirname, '..', 'vapid.json');
if (fs.existsSync(vapidFile)) {
    try {
        const fileData = JSON.parse(fs.readFileSync(vapidFile, 'utf8'));
        if (fileData.publicKey && fileData.privateKey) {
            vapidKeys = fileData;
        }
    } catch (e) {}
}

try {
    webPush.setVapidDetails(
        'mailto:baidobedrcok@gmail.com',
        vapidKeys.publicKey,
        vapidKeys.privateKey
    );
} catch (e) {
    console.warn('VAPID setup warning:', e.message);
}

// GET Public VAPID Key for browser subscription
router.get('/vapid-public-key', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
});

// Ensure database tables exist automatically
async function initTables() {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS announcements (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                content TEXT,
                message TEXT,
                category VARCHAR(100) DEFAULT 'Campus News',
                target_audience VARCHAR(50) DEFAULT 'all',
                audience VARCHAR(50) DEFAULT 'all',
                is_urgent BOOLEAN DEFAULT false,
                is_banner BOOLEAN DEFAULT true,
                publish_date DATE DEFAULT CURRENT_DATE,
                starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
                image_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const columnsToAdd = [
            'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS content TEXT;',
            'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS message TEXT;',
            'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT \'Campus News\';',
            'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_audience VARCHAR(50) DEFAULT \'all\';',
            'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS audience VARCHAR(50) DEFAULT \'all\';',
            'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT false;',
            'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_banner BOOLEAN DEFAULT true;',
            'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS publish_date DATE DEFAULT CURRENT_DATE;',
            'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;',
            'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL \'30 days\');',
            'ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_url TEXT;'
        ];

        for (const sql of columnsToAdd) {
            try { await query(sql); } catch (colErr) {}
        }

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

    } catch (e) {
        console.warn('Announcements table init warning:', e.message);
    }
}
initTables();

// Helper to broadcast VAPID Push Notification to all subscribed devices
async function broadcastPushNotification(payloadData) {
    try {
        const { rows } = await query(`SELECT * FROM push_subscriptions`);
        if (!rows || rows.length === 0) return;

        const payload = JSON.stringify({
            title: payloadData.title || 'Baidoa Bedrock ICT Campus',
            body: payloadData.body || payloadData.message || payloadData.content || 'New urgent announcement!',
            icon: payloadData.icon || '/images/icons/icon-192.png',
            badge: '/images/icons/icon-192.png',
            url: payloadData.url || '/HTML/index.html'
        });

        const sendPromises = rows.map(async (sub) => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.keys_p256dh,
                    auth: sub.keys_auth
                }
            };
            try {
                await webPush.sendNotification(pushSubscription, payload);
            } catch (err) {
                // If subscription expired or invalid (410/404), remove from DB
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint]).catch(() => {});
                }
            }
        });

        await Promise.allSettled(sendPromises);
    } catch (err) {
        console.warn('Push broadcast error:', err.message);
    }
}

// GET all announcements
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT id, title, 
                   COALESCE(content, message, '') AS content,
                   COALESCE(message, content, '') AS message,
                   COALESCE(category, 'Campus News') AS category,
                   COALESCE(target_audience, audience, 'all') AS target_audience,
                   COALESCE(audience, target_audience, 'all') AS audience,
                   COALESCE(is_urgent, false) AS is_urgent,
                   COALESCE(is_banner, true) AS is_banner,
                   COALESCE(publish_date, created_at::date) AS publish_date,
                   image_url, created_at
            FROM announcements 
            ORDER BY created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET latest announcements
router.get('/latest', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 6;
        const { rows } = await query(`
            SELECT id, title, 
                   COALESCE(content, message, '') AS content,
                   COALESCE(message, content, '') AS message,
                   COALESCE(category, 'Campus News') AS category,
                   COALESCE(target_audience, audience, 'all') AS target_audience,
                   COALESCE(audience, target_audience, 'all') AS audience,
                   COALESCE(is_urgent, false) AS is_urgent,
                   COALESCE(publish_date, created_at::date) AS publish_date,
                   image_url, created_at
            FROM announcements 
            ORDER BY created_at DESC 
            LIMIT $1
        `, [limit]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET active announcements
router.get('/active', async (req, res) => {
    try {
        const { target = 'all' } = req.query;
        const { rows } = await query(`
            SELECT id, title, 
                   COALESCE(content, message, '') AS content,
                   COALESCE(message, content, '') AS message,
                   COALESCE(category, 'Campus News') AS category,
                   COALESCE(target_audience, audience, 'all') AS target_audience,
                   COALESCE(audience, target_audience, 'all') AS audience,
                   COALESCE(is_urgent, false) AS is_urgent,
                   COALESCE(is_banner, true) AS is_banner,
                   COALESCE(publish_date, created_at::date) AS publish_date,
                   image_url, created_at
            FROM announcements 
            WHERE (COALESCE(target_audience, audience, 'all') = 'all' OR COALESCE(target_audience, audience, 'all') = $1)
              AND (expires_at IS NULL OR expires_at >= NOW())
            ORDER BY is_urgent DESC, created_at DESC 
            LIMIT 10
        `, [target]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single announcement
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await query(`
            SELECT id, title, 
                   COALESCE(content, message, '') AS content,
                   COALESCE(message, content, '') AS message,
                   COALESCE(category, 'Campus News') AS category,
                   COALESCE(target_audience, audience, 'all') AS target_audience,
                   COALESCE(audience, target_audience, 'all') AS audience,
                   COALESCE(is_urgent, false) AS is_urgent,
                   COALESCE(is_banner, true) AS is_banner,
                   COALESCE(publish_date, created_at::date) AS publish_date,
                   image_url, created_at
            FROM announcements 
            WHERE id = $1
        `, [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Announcement not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create a new announcement & trigger real OS Lock-Screen Push Broadcast
router.post('/', async (req, res) => {
    try {
        const { title, content, message, category, target_audience, audience, is_urgent, is_banner, publishDate, imageUrl, expires_at } = req.body;
        const bodyText = (content || message || '').trim();
        if (!title || !bodyText) {
            return res.status(400).json({ error: 'Title and content/message are required' });
        }

        const expiry = expires_at ? new Date(expires_at) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const aud = target_audience || audience || 'all';
        const pDate = publishDate ? new Date(publishDate) : new Date();

        const { rows } = await query(`
            INSERT INTO announcements 
            (title, content, message, category, target_audience, audience, is_urgent, is_banner, publish_date, image_url, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            title.trim(),
            bodyText,
            bodyText,
            category || 'Campus News',
            aud,
            aud,
            !!is_urgent,
            is_banner !== false,
            pDate,
            imageUrl || null,
            expiry
        ]);

        const newAnnouncement = rows[0];

        // Trigger real background Web Push notification to all phone / lock screens
        broadcastPushNotification({
            title: title.trim(),
            body: bodyText,
            url: '/HTML/index.html'
        });

        res.status(201).json(newAnnouncement);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update announcement
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, message, category, target_audience, audience, is_urgent, is_banner, publishDate, imageUrl } = req.body;
        const bodyText = (content || message || '').trim();
        const aud = target_audience || audience || 'all';
        const pDate = publishDate ? new Date(publishDate) : new Date();

        const { rows } = await query(`
            UPDATE announcements
            SET title = COALESCE($1, title),
                content = COALESCE($2, content),
                message = COALESCE($2, message),
                category = COALESCE($3, category),
                target_audience = COALESCE($4, target_audience),
                audience = COALESCE($4, audience),
                is_urgent = COALESCE($5, is_urgent),
                is_banner = COALESCE($6, is_banner),
                publish_date = COALESCE($7, publish_date),
                image_url = COALESCE($8, image_url)
            WHERE id = $9
            RETURNING *
        `, [title ? title.trim() : null, bodyText || null, category || null, aud, is_urgent, is_banner, pDate, imageUrl || null, id]);

        if (rows.length === 0) return res.status(404).json({ error: 'Announcement not found' });

        res.json(rows[0]);
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

        res.json({ success: true, message: 'Web Push Subscription registered successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
