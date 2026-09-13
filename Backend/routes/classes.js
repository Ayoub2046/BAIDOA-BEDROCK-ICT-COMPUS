// Backend/routes/classes.js

const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { query } = require('../database.js');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

// GET all classes (joined with teacher name, excluding soft-deleted)
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT c.id, c.name, c.teacherid, t.name AS "teacherName", c.room, c.students, c.capacity, c.color
            FROM classes c
            LEFT JOIN users t ON c.teacherid = t.id AND t.role = 'Teacher'
            WHERE c.deleted_at IS NULL
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST (add) a new class
router.post('/', async (req, res) => {
    const { name, teacherId, room, students, capacity, color } = req.body;
    try {
        const { rows } = await query(
            `INSERT INTO classes (name, teacherid, room, students, capacity, color) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [name, teacherId, room, students, capacity, color]
        );
        res.status(201).json({ id: rows[0].id, ...req.body });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT (update) a class
router.put('/:id', async (req, res) => {
    const { name, teacherId, room, students, capacity, color } = req.body;
    try {
        await query(
            `UPDATE classes SET name = $1, teacherid = $2, room = $3, students = $4, capacity = $5, color = $6 WHERE id = $7`,
            [name, teacherId, room, students, capacity, color, req.params.id]
        );
        res.json({ message: 'success' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE a class (soft-delete)
router.delete('/:id', async (req, res) => {
    try {
        await query(`UPDATE classes SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// GET students assigned to a class
router.get('/:id/students', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT s.id, s.name, s.grade, s.enrollmentdate, s.birthdate, s.attendance,
                   u.name AS parent_name, c.name AS class_name
            FROM class_students cs
            JOIN students s ON cs.student_id = s.id
            LEFT JOIN users u ON u.id = s.parentid
            JOIN classes c ON c.id = cs.class_id
            WHERE cs.class_id = $1 AND s.deleted_at IS NULL
            ORDER BY s.name
        `, [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET students NOT yet assigned to a class (for the assign dropdown)
router.get('/:id/unassigned-students', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT s.id, s.name, s.grade
            FROM students s
            WHERE s.deleted_at IS NULL
              AND s.id NOT IN (
                SELECT student_id FROM class_students WHERE class_id = $1
              )
            ORDER BY s.name
        `, [req.params.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST assign students to a class
router.post('/:id/students', async (req, res) => {
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ error: 'studentIds array is required' });
    }
    try {
        for (const studentId of studentIds) {
            await query(
                `INSERT INTO class_students (class_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [req.params.id, studentId]
            );
        }
        // Update the student count in classes table
        await query(`
            UPDATE classes SET students = (
                SELECT COUNT(*) FROM class_students WHERE class_id = $1
            ) WHERE id = $1
        `, [req.params.id]);
        res.status(201).json({ message: 'Students assigned successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE remove a student from a class
router.delete('/:id/students/:studentId', async (req, res) => {
    try {
        await query(
            `DELETE FROM class_students WHERE class_id = $1 AND student_id = $2`,
            [req.params.id, req.params.studentId]
        );
        // Update the student count in classes table
        await query(`
            UPDATE classes SET students = (
                SELECT COUNT(*) FROM class_students WHERE class_id = $1
            ) WHERE id = $1
        `, [req.params.id]);
        res.json({ message: 'Student removed from class' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- CSV Template for Class Assignment ---
router.get('/assign-template/download', (req, res) => {
    const csv = stringify([
        ['StudentID', 'ClassName'],
        ['ELP250001', 'Grade 12-A'],
        ['ELP250002', 'Grade 11-B']
    ]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="class-assignment-template.csv"');
    res.send(csv);
});

// --- CSV Upload for Bulk Class Assignment ---
router.post('/assign-csv', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'CSV file is required.' });
    try {
        const content = req.file.buffer.toString('utf-8');
        const records = parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true });

        let assigned = 0, errors = [];

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rk = Object.keys(row).reduce((acc, k) => { acc[k.toLowerCase().replace(/\(.*\)/g,'').trim()] = row[k]; return acc; }, {});
            const studentIdRaw = (rk['studentid'] || '').toString().replace('ELP', '').trim();
            const studentId = parseInt(studentIdRaw) - 250000;
            const className = (rk['classname'] || '').trim();
            if (!studentId || !className) { errors.push(`Row ${i+2}: Invalid StudentID or ClassName`); continue; }

            try {
                const { rows: classRows } = await query(`SELECT id FROM classes WHERE LOWER(name) = LOWER($1)`, [className]);
                if (classRows.length === 0) { errors.push(`Row ${i+2}: Class "${className}" not found`); continue; }
                const classId = classRows[0].id;

                await query(
                    `INSERT INTO class_students (class_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [classId, studentId]
                );
                assigned++;
            } catch (e) {
                errors.push(`Row ${i+2}: ${e.message}`);
            }
        }

        // Update class student counts
        await query(`
            UPDATE classes SET students = (SELECT COUNT(*) FROM class_students WHERE class_id = classes.id)
        `);

        res.json({ message: `Assigned ${assigned} student(s) to classes.`, errors: errors.length > 0 ? errors : undefined });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;