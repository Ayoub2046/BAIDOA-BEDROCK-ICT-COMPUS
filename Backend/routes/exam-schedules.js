// Backend/routes/exam-schedules.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// GET all exam schedules (admin view)
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT es.id, es.class_id, es.subject, es.exam_date, es.start_time, es.end_time, es.room,
                   c.name AS "className"
            FROM exam_schedules es
            LEFT JOIN classes c ON es.class_id = c.id
            ORDER BY es.exam_date ASC, es.start_time ASC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET exam schedules for a specific class
router.get('/class/:classId', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT es.id, es.subject, es.exam_date, es.start_time, es.end_time, es.room,
                   c.name AS "className"
            FROM exam_schedules es
            LEFT JOIN classes c ON es.class_id = c.id
            WHERE es.class_id = $1
            ORDER BY es.exam_date ASC, es.start_time ASC
        `, [req.params.classId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create a new exam schedule
router.post('/', async (req, res) => {
    const { classId, subject, examDate, startTime, endTime, room } = req.body;
    if (!classId || !subject || !examDate || !startTime || !endTime) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    try {
        const { rows } = await query(
            `INSERT INTO exam_schedules (class_id, subject, exam_date, start_time, end_time, room)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [classId, subject, examDate, startTime, endTime, room || '']
        );
        res.status(201).json({ id: rows[0].id, message: 'Exam schedule created.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update an exam schedule
router.put('/:id', async (req, res) => {
    const { classId, subject, examDate, startTime, endTime, room } = req.body;
    try {
        await query(
            `UPDATE exam_schedules SET class_id = $1, subject = $2, exam_date = $3,
             start_time = $4, end_time = $5, room = $6 WHERE id = $7`,
            [classId, subject, examDate, startTime, endTime, room || '', req.params.id]
        );
        res.json({ message: 'Exam schedule updated.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE an exam schedule (soft-delete)
router.delete('/:id', async (req, res) => {
    try {
        await query(`UPDATE exam_schedules SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Exam schedule deleted.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
