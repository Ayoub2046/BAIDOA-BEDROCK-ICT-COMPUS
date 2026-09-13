// Backend/routes/messages.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// GET all messages, grouped by channel
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM messages ORDER BY id DESC`);
        const groupedMessages = rows.reduce((acc, msg) => {
            const channel = msg.channelid;
            if (!acc[channel]) acc[channel] = [];
            msg.unread = msg.isread === false;
            acc[channel].push(msg);
            return acc;
        }, {});
        res.json(groupedMessages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST (send) a new message
router.post('/', async (req, res) => {
    const { channelId, subject, body, sender } = req.body;
    const messageSender = sender || 'Anonymous';
    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    try {
        const { rows } = await query(
            `INSERT INTO messages (channelid, sender, subject, body, time) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [channelId, messageSender, subject, body, time]
        );
        res.status(201).json({ message: 'Message sent successfully!', id: rows[0].id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT (mark a message as read)
router.put('/read/:id', async (req, res) => {
    try {
        await query(`UPDATE messages SET isread = true WHERE id = $1`, [req.params.id]);
        res.json({ message: 'success' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;