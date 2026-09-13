// Backend/routes/testimonials.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// GET all testimonials
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM testimonials ORDER BY id DESC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET a single testimonial by ID
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM testimonials WHERE id = $1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Testimonial not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST a new testimonial
router.post('/', async (req, res) => {
    const { quote, author, relation } = req.body;
    try {
        const { rows } = await query(
            `INSERT INTO testimonials (quote, author, relation) VALUES ($1, $2, $3) RETURNING id`,
            [quote, author, relation]
        );
        res.status(201).json({ id: rows[0].id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update a testimonial
router.put('/:id', async (req, res) => {
    const { quote, author, relation } = req.body;
    try {
        await query(
            `UPDATE testimonials SET quote = $1, author = $2, relation = $3 WHERE id = $4`,
            [quote, author, relation, req.params.id]
        );
        res.json({ message: 'updated' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE a testimonial
router.delete('/:id', async (req, res) => {
    try {
        await query(`DELETE FROM testimonials WHERE id = $1`, [req.params.id]);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;