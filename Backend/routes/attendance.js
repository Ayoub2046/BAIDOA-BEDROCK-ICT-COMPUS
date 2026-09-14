// Backend/routes/attendance.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// GET attendance for a specific date (admin - all students)
router.get('/:date', async (req, res) => {
    const { date } = req.params;
    try {
        const { rows } = await query(`
            SELECT s.id, s.name, ar.status
            FROM students s
            LEFT JOIN attendance_records ar ON s.id = ar.student_id AND ar.date = $1
            ORDER BY s.id ASC
        `, [date]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET attendance for a specific class and date (teacher)
router.get('/class/:classId/:date', async (req, res) => {
    const { classId, date } = req.params;
    try {
        const { rows: students } = await query(`
            SELECT DISTINCT s.id, s.name, ar.status
            FROM students s
            LEFT JOIN class_students cs ON (cs.student_id = s.id AND cs.deleted_at IS NULL)
            LEFT JOIN attendance_records ar ON (s.id = ar.student_id AND ar.date = $2 AND ar.deleted_at IS NULL)
            WHERE (cs.class_id = $1 OR s.classid = $1)
              AND s.deleted_at IS NULL
            ORDER BY s.name ASC
        `, [classId, date]);

        let isLocked = false;
        let submittedAt = null;
        try {
            const { rows: lockRows } = await query(`
                SELECT is_locked, created_at, updated_at
                FROM class_attendance_locks
                WHERE class_id = $1 AND date = $2
                LIMIT 1
            `, [classId, date]);
            if (lockRows.length > 0) {
                isLocked = lockRows[0].is_locked === true;
                submittedAt = lockRows[0].updated_at || lockRows[0].created_at;
            } else {
                const hasRecords = students.some(s => s.status !== null && s.status !== undefined);
                if (hasRecords) {
                    isLocked = true;
                }
            }
        } catch (e) {}

        res.json({ students, is_locked: isLocked, submitted_at: submittedAt });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET student attendance history
router.get('/student/:studentId/history', async (req, res) => {
    const { studentId } = req.params;
    try {
        const { rows } = await query(`
            SELECT ar.date, ar.status
            FROM attendance_records ar
            WHERE ar.student_id = $1
            ORDER BY ar.date DESC
        `, [studentId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET student attendance stats
router.get('/student/:studentId/stats', async (req, res) => {
    const { studentId } = req.params;
    try {
        const { rows } = await query(`
            SELECT 
                COUNT(*) as total_days,
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_count,
                SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_count,
                SUM(CASE WHEN status = 'On-Leave' THEN 1 ELSE 0 END) as leave_count
            FROM attendance_records
            WHERE student_id = $1
        `, [studentId]);
        
        const stats = rows[0];
        const totalDays = parseInt(stats.total_days) || 0;
        const presentCount = parseInt(stats.present_count) || 0;
        const percentage = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 0;
        
        res.json({
            totalDays,
            presentCount,
            absentCount: parseInt(stats.absent_count) || 0,
            leaveCount: parseInt(stats.leave_count) || 0,
            percentage
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET student attendance by month for chart
router.get('/student/:studentId/monthly', async (req, res) => {
    const { studentId } = req.params;
    try {
        const { rows } = await query(`
            SELECT 
                TO_CHAR(date, 'YYYY-MM') as month,
                COUNT(*) as total_days,
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_count,
                SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_count
            FROM attendance_records
            WHERE student_id = $1
            GROUP BY TO_CHAR(date, 'YYYY-MM')
            ORDER BY month ASC
        `, [studentId]);
        
        const chartData = rows.map(r => ({
            month: r.month,
            totalDays: parseInt(r.total_days),
            presentCount: parseInt(r.present_count),
            absentCount: parseInt(r.absent_count),
            percentage: Math.round((parseInt(r.present_count) / parseInt(r.total_days)) * 100)
        }));
        
        res.json(chartData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST (save) attendance for a specific date
router.post('/', async (req, res) => {
    const { date, records, classId, teacherId, role } = req.body;
    if (!records || !Array.isArray(records)) {
        return res.status(400).json({ error: 'Invalid records data format.' });
    }
    try {
        // If user is a teacher and classId is provided, check if already locked
        if (classId && role !== 'Admin') {
            try {
                const { rows: lockRows } = await query(`
                    SELECT is_locked FROM class_attendance_locks WHERE class_id = $1 AND date = $2 LIMIT 1
                `, [classId, date]);
                if (lockRows.length > 0 && lockRows[0].is_locked) {
                    return res.status(403).json({
                        error: 'Attendance for this date has already been submitted and is locked. Contact administrator to request an edit.',
                        locked: true
                    });
                }
            } catch (e) {}
        }

        for (const record of records) {
            await query(
                `INSERT INTO attendance_records (student_id, date, status)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (student_id, date) DO UPDATE SET status = EXCLUDED.status`,
                [record.student_id, date, record.status]
            );
        }

        // Lock attendance for this class and date
        if (classId) {
            try {
                await query(`
                    INSERT INTO class_attendance_locks (class_id, date, submitted_by, is_locked, updated_at)
                    VALUES ($1, $2, $3, true, NOW())
                    ON CONFLICT (class_id, date) DO UPDATE
                    SET is_locked = true, submitted_by = COALESCE(EXCLUDED.submitted_by, class_attendance_locks.submitted_by), updated_at = NOW()
                `, [classId, date, teacherId || null]);
            } catch (e) {}
        }

        res.status(200).json({ message: 'Attendance saved and locked successfully.', is_locked: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT (toggle lock/unlock) for class attendance on a date (Admin control)
router.put('/lock-status', async (req, res) => {
    const { classId, date, isLocked } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required' });
    try {
        if (classId) {
            await query(`
                INSERT INTO class_attendance_locks (class_id, date, is_locked, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (class_id, date) DO UPDATE
                SET is_locked = EXCLUDED.is_locked, updated_at = NOW()
            `, [classId, date, isLocked === true]);
        } else {
            await query(`
                UPDATE class_attendance_locks SET is_locked = $1, updated_at = NOW() WHERE date = $2
            `, [isLocked === true, date]);
        }
        res.json({ message: `Attendance ${isLocked ? 'locked' : 'unlocked'} successfully.`, is_locked: isLocked === true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT recalculate overall attendance for all students
router.put('/recalculate-overall', async (req, res) => {
    try {
        await query(`
            UPDATE students
            SET attendance = subquery.pct
            FROM (
                SELECT
                    student_id,
                    CAST(
                        SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) * 100.0 / COUNT(id)
                    AS REAL) AS pct
                FROM attendance_records
                GROUP BY student_id
            ) AS subquery
            WHERE students.id = subquery.student_id
        `);
        res.json({ message: 'Overall attendance percentages recalculated.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;