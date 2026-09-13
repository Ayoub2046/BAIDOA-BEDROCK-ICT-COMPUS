// Backend/routes/content.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// GET all homepage content
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM content`);
        const contentObject = rows.reduce((obj, item) => {
            obj[item.key] = item.value;
            return obj;
        }, {});
        res.json(contentObject);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST (save) all homepage content (upsert)
router.post('/', async (req, res) => {
    const content = req.body;
    try {
        for (const key in content) {
            await query(
                `INSERT INTO content (key, value) VALUES ($1, $2)
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                [key, content[key]]
            );
        }
        res.status(200).json({ message: 'Content saved successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;