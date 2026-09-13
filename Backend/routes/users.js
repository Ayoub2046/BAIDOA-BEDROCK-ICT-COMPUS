// Backend/routes/users.js

const express = require('express');
const bcrypt = require('bcrypt');
const { query } = require('../database.js');
const router = express.Router();

// GET all users (without password)
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`SELECT id, name, email, role FROM users WHERE deleted_at IS NULL ORDER BY id`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET all parent users for dropdown
router.get('/parents', async (req, res) => {
    try {
        const { rows } = await query(`SELECT id, name, email FROM users WHERE role = 'Parent' AND deleted_at IS NULL ORDER BY name`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT (update) a user's role, name, email, and optionally password
router.put('/:id', async (req, res) => {
    const { name, email, role, password } = req.body;
    try {
        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            await query(
                `UPDATE users SET name = $1, email = $2, role = $3, password = $4 WHERE id = $5`,
                [name, email, role, hashedPassword, req.params.id]
            );
        } else {
            await query(
                `UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4`,
                [name, email, role, req.params.id]
            );
        }
        res.json({ message: 'success' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE a user (soft-delete)
router.delete('/:id', async (req, res) => {
    try {
        await query(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
