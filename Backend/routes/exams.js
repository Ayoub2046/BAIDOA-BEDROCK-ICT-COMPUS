// Backend/routes/exams.js
// Dynamic exam definitions (Quiz 1, Semester 1, ...) and per-class assignment

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 50);
}

// Ensure the exams/class_exams tables exist before any query runs
async function ensureTables() {
    await query(`
        CREATE TABLE IF NOT EXISTS exams (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            exam_key TEXT NOT NULL UNIQUE,
            max_score NUMERIC(5,2) DEFAULT 100,
            sort_order INTEGER DEFAULT 0,
            active BOOLEAN DEFAULT true,
            deleted_at TIMESTAMP
        )
    `);
    await query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS exam_key TEXT UNIQUE`);
    await query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_score NUMERIC(5,2) DEFAULT 100`);
    await query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`);
    await query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true`);
    await query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
    // Make legacy per-class exam columns nullable so the shared exam list can be seeded
    try { await query(`ALTER TABLE exams ALTER COLUMN class_id DROP NOT NULL`); } catch (e) {}
    try { await query(`ALTER TABLE exams ALTER COLUMN class_id SET DEFAULT NULL`); } catch (e) {}
    await query(`
        CREATE TABLE IF NOT EXISTS class_exams (
            class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
            exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
            assigned_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (class_id, exam_id)
        )
    `);
    await query(`
        INSERT INTO exams (name, exam_key, max_score, sort_order)
        VALUES
            ('Quiz 1', 'quiz1', 5, 1),
            ('Quiz 2', 'quiz2', 5, 2),
            ('Semester 1', 'sem1', 5, 3),
            ('Semester 2', 'sem2', 5, 4),
            ('Midterm', 'midterm', 40, 5),
            ('Final', 'final', 40, 6)
        ON CONFLICT (exam_key) DO NOTHING
    `).catch(e => {});
}

// GET all active exams ordered by sort_order
router.get('/', async (req, res) => {
    try {
        await ensureTables();
        const { rows } = await query(
            `SELECT id, name, exam_key, max_score, sort_order, active
             FROM exams WHERE deleted_at IS NULL ORDER BY sort_order ASC, id ASC`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET exams assigned to a class (admin-created exams only)
router.get('/class/:classId', async (req, res) => {
    try {
        await ensureTables();
        const classId = parseInt(req.params.classId);
        // Check if specific exams were assigned by admin to this class
        const { rows: assignedExams } = await query(`
            SELECT e.id, e.name, e.exam_key, e.max_score, e.sort_order, e.active, true AS assigned
            FROM class_exams ce
            JOIN exams e ON ce.exam_id = e.id
            WHERE ce.class_id = $1 AND e.deleted_at IS NULL AND e.active = true
            ORDER BY e.sort_order ASC, e.id ASC
        `, [classId]);

        if (assignedExams.length > 0) {
            return res.json(assignedExams);
        }

        // Fallback: If admin hasn't restricted exams for this class yet, return all active admin-created exams
        const { rows: allExams } = await query(`
            SELECT id, name, exam_key, max_score, sort_order, active, false AS assigned
            FROM exams
            WHERE deleted_at IS NULL AND active = true
            ORDER BY sort_order ASC, id ASC
        `);
        res.json(allExams);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create a new exam
router.post('/', async (req, res) => {
    const { name, examKey, maxScore, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: 'Exam name is required.' });
    const key = examKey || slugify(name);
    try {
        await ensureTables();
        const { rows } = await query(
            `INSERT INTO exams (name, exam_key, max_score, sort_order)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [name, key, parseFloat(maxScore) || 100, parseInt(sortOrder) || 0]
        );
        res.status(201).json({ id: rows[0].id, message: 'Exam created.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update an exam
router.put('/:id', async (req, res) => {
    const { name, examKey, maxScore, sortOrder, active } = req.body;
    try {
        await ensureTables();
        await query(
            `UPDATE exams SET name = $1, exam_key = $2, max_score = $3, sort_order = $4, active = $5 WHERE id = $6`,
            [name, examKey, parseFloat(maxScore) || 100, parseInt(sortOrder) || 0, active !== false, req.params.id]
        );
        res.json({ message: 'Exam updated.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE an exam (soft-delete)
router.delete('/:id', async (req, res) => {
    try {
        await ensureTables();
        await query(`UPDATE exams SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Exam deleted.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST assign a set of exams to a class (replaces existing assignments)
router.post('/class/:classId/assign', async (req, res) => {
    const classId = parseInt(req.params.classId);
    const { examIds } = req.body;
    if (isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });
    if (!Array.isArray(examIds)) return res.status(400).json({ error: 'examIds array is required.' });
    try {
        await ensureTables();
        await query(`DELETE FROM class_exams WHERE class_id = $1`, [classId]);
        for (const examId of examIds) {
            await query(
                `INSERT INTO class_exams (class_id, exam_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [classId, examId]
            );
        }
        res.json({ message: 'Exams assigned to class.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
