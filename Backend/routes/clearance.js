// Backend/routes/clearance.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// GET clearance status for a student
router.get('/student/:studentId', async (req, res) => {
    try {
        const studentId = parseInt(req.params.studentId);
        const { rows } = await query(
            `SELECT * FROM clearance_cards WHERE student_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
            [studentId]
        );
        const { rows: feeRows } = await query(
            `SELECT COUNT(*) FILTER (WHERE LOWER(status) IN ('pending','overdue','unpaid')) AS unpaid
             FROM fees WHERE studentid = $1 AND deleted_at IS NULL`,
            [studentId]
        );
        const unpaidCount = feeRows[0] ? parseInt(feeRows[0].unpaid || 0) : 0;
        
        if (rows.length > 0) {
            const c = rows[0];
            const isCleared = c.is_cleared || (unpaidCount === 0);
            return res.json({
                isCleared: !!isCleared,
                released_by: c.released_by || (unpaidCount === 0 ? 'Fee Clearance System' : 'Admin'),
                released_at: c.released_at || new Date(),
                semester: c.semester || 'Current Semester',
                id: c.id,
                student_id: c.student_id
            });
        }
        
        res.json({
            isCleared: unpaidCount === 0,
            released_by: unpaidCount === 0 ? 'Fee Clearance System' : null,
            released_at: unpaidCount === 0 ? new Date() : null,
            semester: 'Current Semester'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET all clearance cards (admin view)
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT cc.id, cc.student_id, cc.is_cleared, cc.released_by, cc.released_at, cc.semester,
                   s.name AS "studentName", s.grade
            FROM clearance_cards cc
            LEFT JOIN students s ON cc.student_id = s.id
            ORDER BY cc.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST release clearance for a student
router.post('/', async (req, res) => {
    const { studentId, releasedBy, semester } = req.body;
    if (!studentId) {
        return res.status(400).json({ error: 'Student ID is required.' });
    }
    try {
        // Check if student already has an active clearance
        const { rows: existing } = await query(
            `SELECT id FROM clearance_cards WHERE student_id = $1 AND is_cleared = true`,
            [studentId]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Student already has an active clearance card.' });
        }

        const { rows } = await query(
            `INSERT INTO clearance_cards (student_id, is_cleared, released_by, released_at, semester)
             VALUES ($1, true, $2, NOW(), $3) RETURNING id`,
            [studentId, releasedBy || 'Admin', semester || 'Current Semester']
        );
        res.status(201).json({ id: rows[0].id, message: 'Clearance card released.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update clearance
router.put('/:id', async (req, res) => {
    const { isCleared, releasedBy, semester } = req.body;
    try {
        await query(
            `UPDATE clearance_cards SET is_cleared = $1, released_by = $2, semester = $3,
             released_at = CASE WHEN $1 = true THEN NOW() ELSE released_at END WHERE id = $4`,
            [isCleared, releasedBy, semester, req.params.id]
        );
        res.json({ message: 'Clearance updated.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE / revoke clearance (soft-delete)
router.delete('/:id', async (req, res) => {
    try {
        await query(`UPDATE clearance_cards SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Clearance revoked.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST /sync — auto-sync clearance for all students based on fee status
router.post('/sync', async (req, res) => {
    try {
        const { rows: students } = await query(`SELECT id FROM students WHERE deleted_at IS NULL`);
        let cleared = 0, revoked = 0;
        for (const s of students) {
            const { rows } = await query(
                `SELECT COUNT(*) FILTER (WHERE status = 'Paid') AS paid,
                        COUNT(*) FILTER (WHERE status IN ('Pending','Overdue')) AS unpaid
                 FROM fees WHERE studentid = $1 AND deleted_at IS NULL`,
                [s.id]
            );
            const { paid, unpaid } = rows[0];
            const shouldClear = parseInt(paid) > 0 && parseInt(unpaid) === 0;

            const existing = await query(
                `SELECT id FROM clearance_cards WHERE student_id = $1 AND deleted_at IS NULL`,
                [s.id]
            );

            if (shouldClear) {
                if (existing.rows.length === 0) {
                    await query(
                        `INSERT INTO clearance_cards (student_id, is_cleared, released_by, released_at, semester)
                         VALUES ($1, true, 'Auto Sync', NOW(), 'Current Semester')`,
                        [s.id]
                    );
                    cleared++;
                } else {
                    const r2 = await query(
                        `UPDATE clearance_cards SET is_cleared = true, released_at = NOW(), released_by = 'Auto Sync'
                         WHERE student_id = $1 AND deleted_at IS NULL AND is_cleared = false
                         RETURNING id`,
                        [s.id]
                    );
                    if (r2.rowCount > 0) cleared++;
                }
            } else {
                const r2 = await query(
                    `UPDATE clearance_cards SET is_cleared = false
                     WHERE student_id = $1 AND deleted_at IS NULL AND is_cleared = true
                     RETURNING id`,
                    [s.id]
                );
                if (r2.rowCount > 0) revoked++;
            }
        }
        res.json({ message: `Synced: ${cleared} cleared, ${revoked} revoked.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
