const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

router.get('/dashboard-details', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Parent email is required.' });

    try {
        const { rows: parentRows } = await query(`SELECT id, name FROM users WHERE LOWER(email) = LOWER($1) AND role IS NOT NULL AND role != ''`, [email]);
        const parent = parentRows[0];
        if (!parent) return res.status(404).json({ error: 'Parent account not found' });

        const { rows: children } = await query(
            `SELECT * FROM students WHERE parentid = $1 ORDER BY name`,
            [parent.id]
        );

        const childrenData = await Promise.all(children.map(async (child) => {
            const results = await (async () => {
                const { rows: resultRows } = await query(
                    `SELECT subject, score, exam_type, max_score FROM results WHERE student_id = $1 AND approval_status = 'approved'`,
                    [child.id]
                );
                const grouped = {};
                resultRows.forEach(r => {
                    if (!grouped[r.subject]) grouped[r.subject] = { scores: {}, total: 0, maxTotal: 0 };
                    const examType = r.exam_type || 'score';
                    const score = parseFloat(r.score) || 0;
                    const maxScore = parseFloat(r.max_score) || 100;
                    grouped[r.subject].scores[examType] = score;
                    grouped[r.subject].total += score;
                    grouped[r.subject].maxTotal += maxScore;
                });
                return grouped;
            })();

            const attendance = await (async () => {
                try {
                    const { rows: attRows } = await query(
                        `SELECT COUNT(*) as total, SUM(CASE WHEN status='Present' THEN 1 ELSE 0 END) as present FROM attendance_records WHERE student_id = $1`,
                        [child.id]
                    );
                    const a = attRows[0];
                    const totalDays = parseInt(a.total) || 0;
                    const presentCount = parseInt(a.present) || 0;
                    return { totalDays, presentCount, percentage: totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 0 };
                } catch { return { totalDays: 0, presentCount: 0, percentage: 0 }; }
            })();

            const attendanceTrend = await (async () => {
                try {
                    const { rows } = await query(
                        `SELECT date, status FROM attendance_records WHERE student_id = $1 ORDER BY date ASC`,
                        [child.id]
                    );
                    return rows.map(r => ({ date: r.date, status: r.status }));
                } catch { return []; }
            })();

            const fees = await (async () => {
                try {
                    const { rows: feeRows } = await query(
                        `SELECT amount, duedate, status FROM fees WHERE studentid = $1 ORDER BY duedate DESC`,
                        [child.id]
                    );
                    return feeRows;
                } catch { return []; }
            })();

            const examSchedule = await (async () => {
                try {
                    const { rows: classRows } = await query(
                        `SELECT class_id FROM class_students WHERE student_id = $1 LIMIT 1`,
                        [child.id]
                    );
                    if (classRows[0]) {
                        const { rows: examRows } = await query(
                            `SELECT subject, exam_date, start_time, end_time, room FROM exam_schedules WHERE class_id = $1 ORDER BY exam_date ASC`,
                            [classRows[0].class_id]
                        );
                        return examRows;
                    }
                    return [];
                } catch { return []; }
            })();

            const timetable = await (async () => {
                try {
                    const { rows: classRows } = await query(
                        `SELECT class_id FROM class_students WHERE student_id = $1 LIMIT 1`,
                        [child.id]
                    );
                    if (classRows[0]) {
                        const { rows: ttRows } = await query(
                            `SELECT day_of_week, subject, start_time, end_time, room, teacher_name FROM timetables WHERE class_id = $1 ORDER BY day_of_week, start_time`,
                            [classRows[0].class_id]
                        );
                        return ttRows;
                    }
                    return [];
                } catch { return []; }
            })();

            const messages = await (async () => {
                try {
                    const { rows: msgRows } = await query(
                        `SELECT m.subject, m.body, m.time, m.sender FROM messages m WHERE m.channelid = $1 ORDER BY m.time DESC LIMIT 10`,
                        [`student-${child.id}`]
                    );
                    return msgRows;
                } catch { return []; }
            })();

            return {
                child,
                results,
                attendance,
                attendanceTrend,
                fees,
                examSchedule,
                timetable,
                messages
            };
        }));

        res.json({ parent, children: childrenData });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
