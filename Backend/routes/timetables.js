// Backend/routes/timetables.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// GET all timetable entries (admin view)
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT t.id, t.class_id, t.day_of_week, t.subject, t.start_time, t.end_time, t.room, t.teacher_name,
                   c.name AS "className"
            FROM timetables t
            LEFT JOIN classes c ON t.class_id = c.id
            ORDER BY 
                CASE t.day_of_week
                    WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
                    WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7
                END,
                t.start_time ASC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET timetable for a specific class
router.get('/class/:classId', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT t.id, t.day_of_week, t.subject, t.start_time, t.end_time, t.room, t.teacher_name,
                   c.name AS "className"
            FROM timetables t
            LEFT JOIN classes c ON t.class_id = c.id
            WHERE t.class_id = $1
            ORDER BY 
                CASE t.day_of_week
                    WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
                    WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7
                END,
                t.start_time ASC
        `, [req.params.classId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create a new timetable entry
router.post('/', async (req, res) => {
    const { classId, dayOfWeek, subject, startTime, endTime, room, teacherName } = req.body;
    if (!classId || !dayOfWeek || !subject || !startTime || !endTime) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    try {
        const { rows } = await query(
            `INSERT INTO timetables (class_id, day_of_week, subject, start_time, end_time, room, teacher_name)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [classId, dayOfWeek, subject, startTime, endTime, room || '', teacherName || '']
        );
        res.status(201).json({ id: rows[0].id, message: 'Timetable entry created.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update a timetable entry
router.put('/:id', async (req, res) => {
    const { classId, dayOfWeek, subject, startTime, endTime, room, teacherName } = req.body;
    try {
        await query(
            `UPDATE timetables SET class_id = $1, day_of_week = $2, subject = $3,
             start_time = $4, end_time = $5, room = $6, teacher_name = $7 WHERE id = $8`,
            [classId, dayOfWeek, subject, startTime, endTime, room || '', teacherName || '', req.params.id]
        );
        res.json({ message: 'Timetable entry updated.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE a timetable entry (soft-delete)
router.delete('/:id', async (req, res) => {
    try {
        await query(`UPDATE timetables SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Timetable entry deleted.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
