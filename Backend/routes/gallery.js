// Backend/routes/gallery.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// GET all gallery items
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM gallery_items ORDER BY id DESC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST a new gallery item
router.post('/', async (req, res) => {
    const { title, description, type, mediaUrl, category } = req.body;
    const uploadDate = new Date().toISOString().split('T')[0];
    try {
        const { rows } = await query(
            `INSERT INTO gallery_items (title, description, type, mediaurl, category, uploaddate) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [title, description, type, mediaUrl, category, uploadDate]
        );
        res.status(201).json({ id: rows[0].id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE a gallery item (soft-delete)
router.delete('/:id', async (req, res) => {
    try {
        await query(`UPDATE gallery_items SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;