const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

router.get('/summary', async (req, res) => {
    try {
        const [students, teachers, events, feesData, attendanceData, resultsData, recentStudents, gradeDist, lowAttendance] = await Promise.all([
            query(`SELECT COUNT(id) AS c FROM students`).catch(() => ({ rows: [{ c: 0 }] })),
            query(`SELECT COUNT(id) AS c FROM users WHERE role = 'Teacher'`).catch(() => ({ rows: [{ c: 0 }] })),
            query(`SELECT COUNT(id) AS c FROM events`).catch(() => ({ rows: [{ c: 0 }] })),
            query(`SELECT status, COUNT(*) AS cnt, SUM(amount) AS tot FROM fees GROUP BY status`).catch(() => ({ rows: [] })),
            query(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) AS present FROM attendance_records`).catch(() => ({ rows: [{ total: 0, present: 0 }] })),
            query(`SELECT COUNT(id) AS c FROM results WHERE approval_status = 'on_hold'`).catch(() => ({ rows: [{ c: 0 }] })),
            query(`SELECT s.*, u.name AS parent_name FROM students s LEFT JOIN users u ON u.id = s.parentid ORDER BY s.id DESC LIMIT 8`).catch(() => ({ rows: [] })),
            query(`SELECT grade, COUNT(*) AS cnt FROM students GROUP BY grade ORDER BY grade`).catch(() => ({ rows: [] })),
            query(`SELECT id, name, grade, attendance FROM students WHERE attendance < 75 ORDER BY attendance ASC LIMIT 5`).catch(() => ({ rows: [] }))
        ]);

        const feeSummary = { paid: 0, pending: 0, overdue: 0, totalPaid: 0, totalPending: 0, totalOverdue: 0 };
        feesData.rows.forEach(r => {
            const s = r.status.toLowerCase();
            if (s === 'paid') { feeSummary.paid = parseInt(r.cnt); feeSummary.totalPaid = parseFloat(r.tot) || 0; }
            else if (s === 'pending' || s === 'overdue') { feeSummary[s.toLowerCase()] = parseInt(r.cnt); feeSummary[`total${s.charAt(0).toUpperCase()+s.slice(1)}`] = parseFloat(r.tot) || 0; }
        });

        const att = attendanceData.rows[0];
        const totalAttendance = parseInt(att.total) || 0;
        const presentCount = parseInt(att.present) || 0;
        const overallAttendancePct = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;

        res.json({
            totalStudents: parseInt(students.rows[0].c) || 0,
            totalTeachers: parseInt(teachers.rows[0].c) || 0,
            upcomingEvents: parseInt(events.rows[0].c) || 0,
            pendingApprovals: parseInt(resultsData.rows[0].c) || 0,
            overallAttendance: { total: totalAttendance, present: presentCount, percentage: overallAttendancePct },
            feeSummary,
            gradeDistribution: gradeDist.rows,
            lowAttendanceStudents: lowAttendance.rows,
            recentStudents: recentStudents.rows
        });
    } catch (error) {
        console.error('Dashboard summary error:', error.message);
        res.status(500).json({ error: 'Failed to load dashboard data' });
    }
});

router.get('/activities', async (req, res) => {
    try {
        const [recentResults, recentFees, recentStudents] = await Promise.all([
            query(`SELECT r.id, s.name AS student_name, r.subject, r.score, r.approval_status, r.submitted_at FROM results r JOIN students s ON s.id = r.student_id ORDER BY r.submitted_at DESC LIMIT 10`).catch(() => ({ rows: [] })),
            query(`SELECT f.id, s.name AS student_name, f.amount, f.status, f.duedate FROM fees f JOIN students s ON s.id = f.studentid ORDER BY f.duedate DESC LIMIT 10`).catch(() => ({ rows: [] })),
            query(`SELECT id, name, grade, enrollmentdate FROM students ORDER BY id DESC LIMIT 10`).catch(() => ({ rows: [] }))
        ]);
        res.json({ recentResults: recentResults.rows, recentFees: recentFees.rows, recentStudents: recentStudents.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
