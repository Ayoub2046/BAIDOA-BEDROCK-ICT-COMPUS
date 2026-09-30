// Backend/routes/announcements.js
// Announcements / broadcasts shown on student dashboards, teacher dashboards, parent portal & homepage

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// Ensure the announcements table and needed columns exist
async function ensureTables() {
    await query(`
        CREATE TABLE IF NOT EXISTS announcements (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            message TEXT,
            category TEXT DEFAULT 'general',
            audience TEXT DEFAULT 'all',
            created_by TEXT,
            image_url TEXT,
            title_so TEXT,
            message_so TEXT,
            title_ar TEXT,
            message_ar TEXT,
            publish_date DATE DEFAULT CURRENT_DATE,
            created_at TIMESTAMP DEFAULT NOW(),
            deleted_at TIMESTAMP
        )
    `);
    try {
        await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_url TEXT`);
        await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general'`);
        await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS publish_date DATE DEFAULT CURRENT_DATE`);
        await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS title_so TEXT`);
        await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS message_so TEXT`);
        await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS title_ar TEXT`);
        await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS message_ar TEXT`);
    } catch (e) {
        // columns already exist or db error
    }
}

// GET all announcements (admin view with filter)
router.get('/', async (req, res) => {
    try {
        await ensureTables();
        const { audience, category } = req.query;
        let sql = `SELECT id, title, message, category, audience, created_by, image_url, 
                          title_so, message_so, title_ar, message_ar,
                          COALESCE(publish_date, created_at::date) as publish_date, created_at 
                   FROM announcements 
                   WHERE deleted_at IS NULL`;
        const params = [];

        if (audience) {
            params.push(audience);
            sql += ` AND (audience = 'all' OR audience = $${params.length})`;
        }
        if (category) {
            params.push(category);
            sql += ` AND category = $${params.length}`;
        }

        sql += ` ORDER BY COALESCE(publish_date, created_at::date) DESC, id DESC`;
        const { rows } = await query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET latest announcements for student/teacher dashboards and homepage
router.get('/latest', async (req, res) => {
    try {
        await ensureTables();
        const limit = parseInt(req.query.limit) || 10;
        const audience = req.query.audience || null;

        let sql = `SELECT id, title, message, category, audience, created_by, image_url, 
                          title_so, message_so, title_ar, message_ar,
                          COALESCE(publish_date, created_at::date) as publish_date, created_at
                   FROM announcements
                   WHERE deleted_at IS NULL`;
        const params = [];

        if (audience) {
            params.push(audience);
            sql += ` AND (audience = 'all' OR audience = $${params.length})`;
        } else {
            sql += ` AND audience = 'all'`; // Hide private messages from public homepage
        }

        params.push(limit);
        sql += ` ORDER BY COALESCE(publish_date, created_at::date) DESC, id DESC LIMIT $${params.length}`;

        const { rows } = await query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single announcement
router.get('/:id', async (req, res) => {
    try {
        await ensureTables();
        const { rows } = await query(`SELECT * FROM announcements WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Announcement not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create an announcement
router.post('/', async (req, res) => {
    const { title, message, category, audience, createdBy, imageUrl, publishDate, title_so, message_so, title_ar, message_ar } = req.body;
    if (!title) return res.status(400).json({ error: 'Announcement title is required.' });
    try {
        await ensureTables();
        const pDate = publishDate && publishDate.trim() ? publishDate : new Date().toISOString().split('T')[0];
        const { rows } = await query(
            `INSERT INTO announcements (title, message, category, audience, created_by, image_url, publish_date, title_so, message_so, title_ar, message_ar)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, title, publish_date`,
            [
                title,
                message || '',
                category || 'general',
                audience || 'all',
                createdBy || 'Admin',
                imageUrl || null,
                pDate,
                title_so || null,
                message_so || null,
                title_ar || null,
                message_ar || null
            ]
        );
        res.status(201).json({ id: rows[0].id, message: 'Announcement created successfully.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update an announcement
router.put('/:id', async (req, res) => {
    const { title, message, category, audience, imageUrl, publishDate, title_so, message_so, title_ar, message_ar } = req.body;
    if (!title) return res.status(400).json({ error: 'Announcement title is required.' });
    try {
        await ensureTables();
        const pDate = publishDate && publishDate.trim() ? publishDate : new Date().toISOString().split('T')[0];
        await query(
            `UPDATE announcements 
             SET title = $1, message = $2, category = $3, audience = $4, image_url = $5, publish_date = $6,
                 title_so = $7, message_so = $8, title_ar = $9, message_ar = $10
             WHERE id = $11 AND deleted_at IS NULL`,
            [title, message || '', category || 'general', audience || 'all', imageUrl || null, pDate, title_so || null, message_so || null, title_ar || null, message_ar || null, req.params.id]
        );
        res.json({ message: 'Announcement updated successfully.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE an announcement (soft-delete)
router.delete('/:id', async (req, res) => {
    try {
        await ensureTables();
        await query(`UPDATE announcements SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Announcement deleted.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
