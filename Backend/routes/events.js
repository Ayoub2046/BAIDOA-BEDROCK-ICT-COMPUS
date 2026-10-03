const express = require('express');
const { query } = require('../database.js');
const { broadcastPushNotification } = require('../services/pushService.js');
const router = express.Router();

// GET all events
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM events`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST (add) a new event & broadcast push notification
router.post('/', async (req, res) => {
    const { title, start, end, backgroundColor, borderColor } = req.body;
    try {
        const { rows } = await query(
            `INSERT INTO events (title, start, "end", backgroundcolor, bordercolor) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [title, start, end || null, backgroundColor, borderColor]
        );
        const eventId = rows[0].id;

        // Broadcast Push Notification to all devices!
        broadcastPushNotification({
            title: '📅 Event: ' + (title || 'New Campus Event'),
            body: 'Date: ' + (start || 'Upcoming') + '. Tap to view details.',
            url: '/HTML/event.html'
        }, 'all');

        res.status(201).json({ id: eventId });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT (update) an event
router.put('/:id', async (req, res) => {
    const { title, start, end, backgroundColor, borderColor } = req.body;
    try {
        await query(
            `UPDATE events SET title = $1, start = $2, "end" = $3, backgroundcolor = $4, bordercolor = $5 WHERE id = $6`,
            [title, start, end || null, backgroundColor, borderColor, req.params.id]
        );
        res.json({ message: 'success' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE an event (soft-delete)
router.delete('/:id', async (req, res) => {
    try {
        await query(`UPDATE events SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;