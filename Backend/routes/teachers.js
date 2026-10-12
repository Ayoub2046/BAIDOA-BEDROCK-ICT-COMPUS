// Backend/routes/teachers.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// GET all users with the role 'Teacher'
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT id, name, subject, email, image FROM users WHERE role = 'Teacher' ORDER BY id DESC`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT (update) a teacher's details
router.put('/:id', async (req, res) => {
    const { name, subject, email, image } = req.body;
    try {
        await query(
            `UPDATE users SET name = $1, subject = $2, email = $3, image = $4 WHERE id = $5 AND role = 'Teacher'`,
            [name, subject, email, image, req.params.id]
        );
        res.json({ message: 'success' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// GET all data for the logged-in teacher's dashboard
router.get('/dashboard-details', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Teacher email required.' });
    try {
        const { rows: teacherRows } = await query(
            `SELECT id, name, email, subject, role, image, isactive, created_at
             FROM users WHERE LOWER(email) = LOWER($1) AND role = 'Teacher'`, [email]
        );
        const teacher = teacherRows[0];
        if (!teacher) return res.status(404).json({ error: 'Teacher account not found.' });

        const { rows: classes } = await query(
            `SELECT c.id, c.name, c.room,
                    (SELECT COUNT(DISTINCT s.id)
                     FROM students s
                     WHERE s.classid = c.id
                        OR s.id IN (SELECT cs.student_id FROM class_students cs WHERE cs.class_id = c.id AND cs.deleted_at IS NULL)
                    )::int AS students
             FROM classes c WHERE c.teacherid = $1 AND c.deleted_at IS NULL`, [teacher.id]
        );

        // Count DISTINCT students across all teacher's classes (avoids double-counting multi-class students)
        const { rows: totalRow } = await query(
            `SELECT COUNT(DISTINCT s.id) AS total
             FROM students s
             JOIN classes c ON c.teacherid = $1 AND c.deleted_at IS NULL
             WHERE s.classid = c.id
                OR s.id IN (SELECT cs.student_id FROM class_students cs
                             JOIN classes c2 ON cs.class_id = c2.id
                             WHERE c2.teacherid = $1 AND c2.deleted_at IS NULL AND cs.deleted_at IS NULL)`,
            [teacher.id]
        );
        const totalStudents = parseInt(totalRow[0]?.total || 0);

        res.json({ ...teacher, classes: classes || [], totalStudents });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET classes assigned to a teacher (for attendance dropdown)
router.get('/classes', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Teacher email required.' });
    try {
        const { rows: teacherRows } = await query(
            `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND role = 'Teacher'`, [email]
        );
        if (!teacherRows[0]) return res.status(404).json({ error: 'Teacher not found.' });
        
        const { rows: classes } = await query(
            `SELECT id, name FROM classes WHERE teacherid = $1 AND deleted_at IS NULL ORDER BY name`, 
            [teacherRows[0].id]
        );
        res.json(classes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;