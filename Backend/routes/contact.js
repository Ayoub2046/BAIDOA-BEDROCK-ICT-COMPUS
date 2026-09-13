// Backend/routes/contact.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// POST a new message from the public contact form
router.post('/', async (req, res) => {
    const { firstName, lastName, email, subject, message } = req.body;
    const submissionDate = new Date().toISOString().split('T')[0];
    if (!firstName || !email || !message) {
        return res.status(400).json({ error: 'First name, email, and message are required.' });
    }
    try {
        await query(
            `INSERT INTO contact_messages (firstname, lastname, email, subject, message, submissiondate) VALUES ($1, $2, $3, $4, $5, $6)`,
            [firstName, lastName, email, subject, message, submissionDate]
        );
        res.status(201).json({ message: 'Message sent successfully! We will get back to you shortly.' });
    } catch (err) {
        console.error('Contact form save error:', err.message);
        res.status(500).json({ error: 'An internal error occurred. Could not save message.' });
    }
});

// GET all contact messages (admin panel)
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM contact_messages ORDER BY id DESC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT (mark a message as read)
router.put('/read/:id', async (req, res) => {
    try {
        await query(`UPDATE contact_messages SET isread = true WHERE id = $1`, [req.params.id]);
        res.json({ message: 'success' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;