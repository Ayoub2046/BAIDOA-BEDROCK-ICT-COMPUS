const express = require('express');
const { query } = require('../database.js');
const { broadcastPushNotification } = require('../services/pushService.js');
const router = express.Router();

// GET all news articles (exclude soft-deleted)
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM news WHERE deleted_at IS NULL ORDER BY id DESC`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET a single news article by ID (include soft-deleted so edit still works)
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM news WHERE id = $1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Article not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST a new news article & broadcast push alert to all devices
router.post('/', async (req, res) => {
    const { title, summary, imageUrl, content } = req.body;
    const publishDate = new Date().toISOString().split('T')[0];
    try {
        const { rows } = await query(
            `INSERT INTO news (title, summary, imageurl, content, publishdate) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [title, summary, imageUrl, content, publishDate]
        );
        const newsId = rows[0].id;

        // Broadcast Push Notification to all devices!
        broadcastPushNotification({
            title: '📰 News: ' + (title || 'Campus News'),
            body: summary || content || 'New campus news published! Tap to read.',
            icon: imageUrl || '/images/icons/icon-192.png',
            url: '/HTML/news-single.html?id=' + newsId
        }, 'all');

        res.status(201).json({ id: newsId });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update a news article
router.put('/:id', async (req, res) => {
    const { title, summary, imageUrl, content } = req.body;
    try {
        await query(
            `UPDATE news SET title = $1, summary = $2, imageurl = $3, content = $4 WHERE id = $5`,
            [title, summary, imageUrl, content, req.params.id]
        );
        res.json({ message: 'updated' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE a news article (soft-delete)
router.delete('/:id', async (req, res) => {
    try {
        await query(`UPDATE news SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;