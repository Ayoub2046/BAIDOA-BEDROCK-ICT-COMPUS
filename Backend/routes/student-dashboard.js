// Backend/routes/student-dashboard.js
// Aggregated endpoint: returns ALL student data in one call

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// GET all dashboard data for a student
router.get('/:studentId', async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) return res.status(400).json({ error: 'Invalid student ID' });

    try {
        // 1. Student info
        const { rows: studentRows } = await query(`
            SELECT *,
                   TO_CHAR(birthdate, 'YYYY-MM-DD') AS birthdate_clean,
                   TO_CHAR(enrollmentdate, 'YYYY-MM-DD') AS enrollmentdate_clean
            FROM students WHERE id = $1
        `, [studentId]);
        const student = studentRows[0];
        if (!student) return res.status(404).json({ error: 'Student not found' });

        // 2. Results (only approved) - grouped by subject with score breakdowns
        let results = {};
        let resultsOnHold = false;
        let releaseAt = null;
        try {
            // Check if student has any results on hold
            const { rows: holdRows } = await query(
                `SELECT release_at FROM results WHERE student_id = $1 AND approval_status = 'on_hold' LIMIT 1`,
                [studentId]
            );
            if (holdRows.length > 0) {
                resultsOnHold = true;
                releaseAt = holdRows[0].release_at || null;
            }
        } catch (e) { /* column may not exist yet */ }

        try {
            const { rows: resultRows } = await query(
                `SELECT subject, score, exam_type, max_score FROM results WHERE student_id = $1 AND approval_status = 'approved'`,
                [studentId]
            );
            // Group by subject, then by exam_type
            resultRows.forEach(r => {
                if (!results[r.subject]) {
                    results[r.subject] = { scores: {}, total: 0, maxTotal: 0 };
                }
                const examType = r.exam_type || 'score';
                const score = parseFloat(r.score) || 0;
                const maxScore = parseFloat(r.max_score) || 100;
                results[r.subject].scores[examType] = score;
                results[r.subject].maxScores = results[r.subject].maxScores || {};
                results[r.subject].maxScores[examType] = maxScore;
                results[r.subject].total += score;
                results[r.subject].maxTotal += maxScore;
            });
        } catch (e) { /* results table may not exist */ }

        // 3. Attendance stats
        let attendance = { totalDays: 0, presentCount: 0, absentCount: 0, leaveCount: 0, percentage: 0 };
        try {
            const { rows } = await query(`
                SELECT 
                    COUNT(*) as total_days,
                    SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_count,
                    SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_count,
                    SUM(CASE WHEN status = 'On-Leave' THEN 1 ELSE 0 END) as leave_count
                FROM attendance_records WHERE student_id = $1
            `, [studentId]);
            const s = rows[0];
            const totalDays = parseInt(s.total_days) || 0;
            const presentCount = parseInt(s.present_count) || 0;
            attendance = {
                totalDays,
                presentCount,
                absentCount: parseInt(s.absent_count) || 0,
                leaveCount: parseInt(s.leave_count) || 0,
                percentage: totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 0
            };
        } catch (e) { /* attendance_records table may not exist */ }

        // 4. Attendance history (last 30 records)
        let attendanceHistory = [];
        try {
            const { rows } = await query(`
                SELECT date, status FROM attendance_records
                WHERE student_id = $1 ORDER BY date DESC LIMIT 30
            `, [studentId]);
            attendanceHistory = rows;
        } catch (e) {}

        // 5. Class assignment
        let classInfo = null;
        try {
            const { rows } = await query(`
                SELECT c.id, c.name, c.room, c.color,
                       t.name AS "teacherName", t.subject AS "teacherSubject", t.email AS "teacherEmail"
                FROM class_students cs
                JOIN classes c ON cs.class_id = c.id
                LEFT JOIN users t ON c.teacherid = t.id AND t.role = 'Teacher'
                WHERE cs.student_id = $1
            `, [studentId]);
            classInfo = rows[0] || null;
        } catch (e) {}

        // 6. Subjects & teachers (from class)
        let subjects = [];
        if (classInfo) {
            try {
                const { rows } = await query(`
                    SELECT DISTINCT t.subject AS subject, t.name AS "teacherName", t.email AS "teacherEmail", t.image AS "teacherImage"
                    FROM class_students cs
                    JOIN classes c ON cs.class_id = c.id
                    JOIN users t ON c.teacherid = t.id AND t.role = 'Teacher'
                    WHERE cs.student_id = $1 AND t.subject IS NOT NULL
                `, [studentId]);
                subjects = rows;
            } catch (e) {}
        }

        // 7. Fees
        let fees = [];
        try {
            const { rows } = await query(
                `SELECT id, amount, status, duedate FROM fees WHERE studentid = $1 ORDER BY duedate DESC`,
                [studentId]
            );
            fees = rows;
        } catch (e) {}

        // 8. Clearance
        let clearance = { isCleared: false };
        try {
            const { rows } = await query(
                `SELECT * FROM clearance_cards WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`,
                [studentId]
            );
            if (rows.length > 0) {
                const c = rows[0];
                clearance = {
                    isCleared: c.is_cleared,
                    released_by: c.released_by,
                    released_at: c.released_at,
                    semester: c.semester
                };
            }
        } catch (e) {}

        // 9. Exam schedule (based on class)
        let examSchedule = [];
        if (classInfo) {
            try {
                const { rows } = await query(
                    `SELECT subject, exam_date, start_time, end_time, room
                     FROM exam_schedules WHERE class_id = $1 ORDER BY exam_date ASC, start_time ASC`,
                    [classInfo.id]
                );
                examSchedule = rows;
            } catch (e) {}
        }

        // 10. Timetable (based on class)
        let timetable = [];
        if (classInfo) {
            try {
                const { rows } = await query(
                    `SELECT day_of_week, subject, start_time, end_time, room, teacher_name
                     FROM timetables WHERE class_id = $1
                     ORDER BY 
                        CASE day_of_week
                            WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
                            WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 WHEN 'Sunday' THEN 7
                        END,
                        start_time ASC`,
                    [classInfo.id]
                );
                timetable = rows;
            } catch (e) {}
        }

        // 11. Exams assigned to the student's class (exam definitions)
        let exams = [];
        if (classInfo) {
            try {
                const { rows } = await query(`
                    SELECT e.id, e.name, e.exam_key, e.max_score, e.sort_order
                    FROM class_exams ce
                    JOIN exams e ON ce.exam_id = e.id
                    WHERE ce.class_id = $1 AND e.deleted_at IS NULL
                    ORDER BY e.sort_order ASC, e.id ASC
                `, [classInfo.id]);
                exams = rows;
            } catch (e) {}
        }
        // Fallback: if none assigned yet, return the full active exam list
        if (exams.length === 0) {
            try {
                const { rows } = await query(
                    `SELECT id, name, exam_key, max_score, sort_order FROM exams WHERE deleted_at IS NULL ORDER BY sort_order ASC`
                );
                exams = rows;
            } catch (e) {}
        }

        // 12. Announcements for the student dashboard
        let announcements = [];
        try {
            const { rows } = await query(
                `SELECT id, title, message, audience, created_at
                 FROM announcements
                 WHERE deleted_at IS NULL AND (audience = 'all' OR audience = 'students')
                 ORDER BY created_at DESC
                 LIMIT 10`
            );
            announcements = rows;
        } catch (e) {}

        // 13. Top 3 Class Leaders in the student's class
        let classLeaders = [];
        if (classInfo && !resultsOnHold) {
            try {
                const { rows: leaderRows } = await query(`
                    SELECT s.id AS student_id, s.name, s.image, s.grade, s.gpa,
                           COALESCE(SUM(r.score), 0) AS total_score,
                           COALESCE(AVG(r.score), 0) AS avg_score,
                           COALESCE(SUM(COALESCE(r.max_score, 100)), 0) AS total_max,
                           COUNT(r.id) AS subject_count
                    FROM students s
                    JOIN results r ON r.student_id = s.id
                    WHERE (s.classid = $1 OR s.id IN (SELECT student_id FROM class_students WHERE class_id = $1))
                      AND s.deleted_at IS NULL
                      AND r.approval_status = 'approved'
                      AND r.deleted_at IS NULL
                    GROUP BY s.id, s.name, s.image, s.grade, s.gpa
                    HAVING COUNT(r.id) > 0
                    ORDER BY total_score DESC, avg_score DESC
                    LIMIT 3
                `, [classInfo.id]);
                classLeaders = leaderRows.map((r, idx) => ({
                    rank: idx + 1,
                    studentId: r.student_id,
                    bbId: 'BB' + String(260000 + r.student_id).padStart(6, '0'),
                    elpId: 'BB' + String(260000 + r.student_id).padStart(6, '0'),
                    name: r.name,
                    image: r.image,
                    grade: r.grade || 'A',
                    gpa: r.gpa,
                    totalScore: parseFloat(r.total_score).toFixed(1).replace(/\.0$/, ''),
                    totalMax: parseFloat(r.total_max).toFixed(1).replace(/\.0$/, ''),
                    avgScore: (parseFloat(r.avg_score) || 0).toFixed(1),
                    percentage: r.total_max > 0 ? Math.round((r.total_score / r.total_max) * 100) : 0,
                    subjectCount: parseInt(r.subject_count) || 0
                }));
            } catch (e) {}
        }

        // Build response
        res.json({
            student: {
                id: student.id,
                bbId: 'BB' + String(260000 + student.id).padStart(6, '0'),
                elpId: 'BB' + String(260000 + student.id).padStart(6, '0'),
                name: student.name,
                grade: student.grade,
                department: student.department || '--',
                period: student.period || '--',
                enrollmentdate: student.enrollmentdate_clean || student.enrollmentdate,
                birthdate: student.birthdate_clean || student.birthdate,
                gpa: student.gpa,
                remarks: student.remarks
            },
            results,
            resultsOnHold,
            releaseAt,
            exams,
            classLeaders,
            attendance,
            attendanceHistory,
            class: classInfo,
            subjects,
            fees,
            clearance,
            examSchedule,
            timetable,
            announcements
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
