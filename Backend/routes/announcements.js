// Backend/routes/announcements.js
// Announcements / broadcasts shown on student dashboards & homepage

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
            audience TEXT DEFAULT 'all',
            created_by TEXT,
            image_url TEXT,
            publish_date DATE DEFAULT CURRENT_DATE,
            created_at TIMESTAMP DEFAULT NOW(),
            deleted_at TIMESTAMP
        )
    `);
    try {
        await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_url TEXT`);
        await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS publish_date DATE DEFAULT CURRENT_DATE`);
    } catch (e) {
        // columns already exist or db error
    }
}

// GET all announcements (admin view)
router.get('/', async (req, res) => {
    try {
        await ensureTables();
        const { rows } = await query(
            `SELECT id, title, message, audience, created_by, image_url, 
                    COALESCE(publish_date, created_at::date) as publish_date, created_at 
             FROM announcements 
             WHERE deleted_at IS NULL 
             ORDER BY COALESCE(publish_date, created_at::date) DESC, id DESC`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET latest announcements for student dashboards and homepage
router.get('/latest', async (req, res) => {
    try {
        await ensureTables();
        const limit = parseInt(req.query.limit) || 10;
        const { rows } = await query(
            `SELECT id, title, message, audience, created_by, image_url, 
                    COALESCE(publish_date, created_at::date) as publish_date, created_at
             FROM announcements
             WHERE deleted_at IS NULL
             ORDER BY COALESCE(publish_date, created_at::date) DESC, id DESC
             LIMIT $1`,
            [limit]
        );
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
    const { title, message, audience, createdBy, imageUrl, publishDate } = req.body;
    if (!title) return res.status(400).json({ error: 'Announcement title is required.' });
    try {
        await ensureTables();
        const pDate = publishDate && publishDate.trim() ? publishDate : new Date().toISOString().split('T')[0];
        const { rows } = await query(
            `INSERT INTO announcements (title, message, audience, created_by, image_url, publish_date)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, title, publish_date`,
            [title, message || '', audience || 'all', createdBy || 'Admin', imageUrl || null, pDate]
        );
        res.status(201).json({ id: rows[0].id, message: 'Announcement created successfully.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update an announcement
router.put('/:id', async (req, res) => {
    const { title, message, audience, imageUrl, publishDate } = req.body;
    if (!title) return res.status(400).json({ error: 'Announcement title is required.' });
    try {
        await ensureTables();
        const pDate = publishDate && publishDate.trim() ? publishDate : new Date().toISOString().split('T')[0];
        await query(
            `UPDATE announcements 
             SET title = $1, message = $2, audience = $3, image_url = $4, publish_date = $5 
             WHERE id = $6 AND deleted_at IS NULL`,
            [title, message || '', audience || 'all', imageUrl || null, pDate, req.params.id]
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
