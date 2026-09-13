// Backend/routes/books.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// GET all books
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM books ORDER BY id DESC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST (add) a new book
router.post('/', async (req, res) => {
    const { title, author, category, cover, digitalLink } = req.body;
    try {
        const { rows } = await query(
            `INSERT INTO books (title, author, category, cover, status, digitallink) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [title, author, category, cover, 'Available', digitalLink]
        );
        res.status(201).json({ id: rows[0].id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT (update) a book
router.put('/:id', async (req, res) => {
    const { title, author, category, cover, status, checkedOutTo, digitalLink } = req.body;
    try {
        await query(
            `UPDATE books SET title = $1, author = $2, category = $3, cover = $4, status = $5, checkedoutto = $6, digitallink = $7 WHERE id = $8`,
            [title, author, category, cover, status, checkedOutTo, digitalLink, req.params.id]
        );
        res.json({ message: 'success' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE a book (soft-delete)
router.delete('/:id', async (req, res) => {
    try {
        await query(`UPDATE books SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;