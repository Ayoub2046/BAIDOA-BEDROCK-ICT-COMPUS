// Backend/routes/fees.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// Auto-update clearance based on fee status
async function autoUpdateClearance(studentId) {
    const { rows } = await query(
        `SELECT COUNT(*) FILTER (WHERE status = 'Paid') AS paid,
                COUNT(*) FILTER (WHERE status IN ('Pending','Overdue')) AS unpaid
         FROM fees WHERE studentid = $1 AND deleted_at IS NULL`,
        [studentId]
    );
    const { paid, unpaid } = rows[0];
    const shouldClear = parseInt(paid) > 0 && parseInt(unpaid) === 0;

    const existing = await query(
        `SELECT id, is_cleared FROM clearance_cards WHERE student_id = $1 AND deleted_at IS NULL`,
        [studentId]
    );

    if (shouldClear) {
        const active = existing.rows.find(r => r.is_cleared !== false);
        if (!active) {
            await query(
                `INSERT INTO clearance_cards (student_id, is_cleared, released_by, released_at, semester)
                 VALUES ($1, true, 'Auto System', NOW(), 'Current Semester')`,
                [studentId]
            );
        } else if (!active.is_cleared) {
            await query(
                `UPDATE clearance_cards SET is_cleared = true, released_at = NOW(), released_by = 'Auto System'
                 WHERE id = $1`, [active.id]
            );
        }
    } else {
        if (existing.rows.length > 0) {
            await query(
                `UPDATE clearance_cards SET is_cleared = false WHERE student_id = $1 AND deleted_at IS NULL`,
                [studentId]
            );
        }
    }
}

// GET all fee records (joined with student name)
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT f.id, f.studentid, f.amount, f.status, f.duedate, s.name AS "studentName"
            FROM fees f
            JOIN students s ON f.studentid = s.id
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST (add) a new fee record — auto-updates clearance on add
router.post('/', async (req, res) => {
    const { studentId, amount, dueDate, status } = req.body;
    try {
        const { rows } = await query(
            `INSERT INTO fees (studentid, amount, duedate, status) VALUES ($1, $2, $3, $4) RETURNING id`,
            [studentId, amount, dueDate, status]
        );
        if (studentId) autoUpdateClearance(studentId).catch(e => console.error('Clearance auto-update error:', e.message));
        res.status(201).json({ id: rows[0].id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT (update) a fee record — auto-updates clearance on status change
router.put('/:id', async (req, res) => {
    const { studentId, amount, dueDate, status } = req.body;
    try {
        await query(
            `UPDATE fees SET studentid = $1, amount = $2, duedate = $3, status = $4 WHERE id = $5`,
            [studentId, amount, dueDate, status, req.params.id]
        );
        if (studentId) autoUpdateClearance(studentId).catch(e => console.error('Clearance auto-update error:', e.message));
        res.json({ message: 'success' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// GET fee records for a specific student
router.get('/student/:studentId', async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT f.id, f.studentid, f.amount, f.status, f.duedate, s.name AS "studentName"
             FROM fees f
             JOIN students s ON f.studentid = s.id
             WHERE f.studentid = $1
             ORDER BY f.duedate DESC`,
            [req.params.studentId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE a fee record (soft-delete)
router.delete('/:id', async (req, res) => {
    try {
        await query(`UPDATE fees SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;