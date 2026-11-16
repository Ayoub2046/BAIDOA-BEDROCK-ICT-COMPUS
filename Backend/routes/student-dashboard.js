// Backend/routes/student-dashboard.js
// Ultra-fast Aggregated Student Dashboard API
// Uses parallel execution (Promise.all) + in-memory TTL caching for instant mobile loads

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// In-memory cache for shared/static data (short TTL to keep database load near-zero)
const cache = new Map();
function getCached(key, ttlMs, fetcher) {
    const item = cache.get(key);
    const now = Date.now();
    if (item && (now - item.time < ttlMs)) {
        return Promise.resolve(item.data);
    }
    return fetcher().then(data => {
        cache.set(key, { time: now, data });
        return data;
    });
}

// Helper: check if archived exams view is enabled
async function getArchivedExamsAllowed() {
    return getCached('app_settings_archived_view', 15000, async () => {
        try {
            const { rows } = await query(
                `SELECT value FROM app_settings WHERE key = 'allow_students_view_archived_exams'`
            );
            return rows[0] && rows[0].value === 'true';
        } catch (e) {
            return false;
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/student-dashboard/:studentId - Fast aggregated dashboard
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:studentId', async (req, res) => {
    try {
        const rawParam = String(req.params.studentId).trim();
        let targetId = parseInt(rawParam);
        let student = null;

        const STUDENT_BASE_SQL = `
            SELECT s.*,
                   TO_CHAR(s.birthdate, 'YYYY-MM-DD') AS birthdate_clean,
                   TO_CHAR(s.enrollmentdate, 'YYYY-MM-DD') AS enrollmentdate_clean,
                   COALESCE(cs.class_id, s.classid) AS active_class_id,
                   c.name AS class_name,
                   c.room AS class_room,
                   c.color AS class_color,
                   t.name AS "teacherName",
                   t.subject AS "teacherSubject",
                   t.email AS "teacherEmail"
            FROM students s
            LEFT JOIN class_students cs ON cs.student_id = s.id
            LEFT JOIN classes c ON (c.id = cs.class_id OR (cs.class_id IS NULL AND c.id = s.classid))
            LEFT JOIN users t ON c.teacherid = t.id AND t.role = 'Teacher'
            WHERE s.deleted_at IS NULL
        `;

        if (!isNaN(targetId) && String(targetId) === rawParam) {
            const { rows } = await query(STUDENT_BASE_SQL + ` AND s.id = $1 LIMIT 1`, [targetId]);
            student = rows[0];
        }

        if (!student) {
            const cleanNoDash = rawParam.toUpperCase().replace(/-/g, '');
            const { rows } = await query(`
                ${STUDENT_BASE_SQL}
                AND (
                    UPPER(s.student_id_code) = UPPER($1)
                    OR UPPER(REPLACE(s.student_id_code, '-', '')) = $2
                    OR s.id = $3
                )
                LIMIT 1
            `, [rawParam, cleanNoDash, parseInt(rawParam) || -1]);
            student = rows[0];
        }

        if (!student) return res.status(404).json({ error: 'Student not found' });
        const studentId = student.id;
        const classId = student.active_class_id ? parseInt(student.active_class_id) : null;

        const classInfo = classId ? {
            id: classId,
            name: student.class_name,
            room: student.class_room,
            color: student.class_color,
            teacherName: student.teacherName,
            teacherSubject: student.teacherSubject,
            teacherEmail: student.teacherEmail
        } : null;

        const isAlumni = (student.status === 'Graduated' || student.status === 'Alumni');

        // Check archived visibility setting
        const allowArchived = await getArchivedExamsAllowed();

        const archiveFilter = allowArchived
            ? `(ep.deleted_at IS NULL AND ep.is_published = true)`
            : `(ep.deleted_at IS NULL AND ep.is_published = true AND (ep.is_archived = false OR ep.is_archived IS NULL))`;

        // Run ALL remaining data queries in parallel
        const [
            resultsRes,
            holdRes,
            attendanceStatsRes,
            attendanceHistoryRes,
            subjectsRes,
            feesRes,
            clearanceRes,
            unpaidFeesRes,
            examScheduleRes,
            timetableRes,
            examsRes,
            announcementsRes,
            classLeadersRes,
            periodsRes,
            certsRes,
            booksRes
        ] = await Promise.all([
            // 1. Results
            query(`
                SELECT r.id, r.subject, r.score, r.exam_type, r.max_score, r.remarks, r.period_id,
                       r.component_id, r.component_name,
                       ep.id as exam_id, ep.name as period_name, ep.month, ep.year, ep.exam_code, ep.total_marks, ep.is_archived
                FROM results r
                LEFT JOIN exam_periods ep ON r.period_id = ep.id
                WHERE r.student_id = $1 
                  AND r.approval_status = 'approved' 
                  AND r.deleted_at IS NULL
                  AND (r.period_id IS NULL OR ${archiveFilter})
                ORDER BY ep.year DESC, ep.month DESC NULLS LAST, r.subject ASC, r.id ASC
            `, [studentId]).catch(() => ({ rows: [] })),

            // 2. Results on hold
            query(`
                SELECT r.release_at, r.period_id 
                FROM results r
                LEFT JOIN exam_periods ep ON r.period_id = ep.id
                WHERE r.student_id = $1 
                  AND r.approval_status = 'on_hold' 
                  AND r.deleted_at IS NULL
                  ${!allowArchived ? 'AND (ep.id IS NULL OR (ep.deleted_at IS NULL AND ep.is_published = true AND (ep.is_archived = false OR ep.is_archived IS NULL)))' : ''}
                LIMIT 1
            `, [studentId]).catch(() => ({ rows: [] })),

            // 3. Attendance Stats
            query(`
                SELECT COUNT(*) as total_days,
                       SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_count,
                       SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_count,
                       SUM(CASE WHEN status = 'On-Leave' THEN 1 ELSE 0 END) as leave_count
                FROM attendance_records WHERE student_id = $1
            `, [studentId]).catch(() => ({ rows: [] })),

            // 4. Attendance History (last 30 days)
            query(`
                SELECT date, status FROM attendance_records
                WHERE student_id = $1 ORDER BY date DESC LIMIT 30
            `, [studentId]).catch(() => ({ rows: [] })),

            // 5. Subjects & Teachers
            classId ? query(`
                SELECT DISTINCT t.subject AS subject, t.name AS "teacherName", t.email AS "teacherEmail", t.image AS "teacherImage"
                FROM class_students cs
                JOIN classes c ON cs.class_id = c.id
                JOIN users t ON c.teacherid = t.id AND t.role = 'Teacher'
                WHERE cs.student_id = $1 AND t.subject IS NOT NULL
            `, [studentId]).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),

            // 6. Fees
            query(
                `SELECT id, amount, status, duedate FROM fees WHERE studentid = $1 ORDER BY duedate DESC`,
                [studentId]
            ).catch(() => ({ rows: [] })),

            // 7. Clearance
            query(
                `SELECT * FROM clearance_cards WHERE student_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
                [studentId]
            ).catch(() => ({ rows: [] })),

            // 8. Unpaid fees count
            query(
                `SELECT COUNT(*) FILTER (WHERE LOWER(status) IN ('pending', 'overdue', 'unpaid')) AS unpaid_count
                 FROM fees WHERE studentid = $1 AND deleted_at IS NULL`,
                [studentId]
            ).catch(() => ({ rows: [] })),

            // 9. Exam Schedule
            classId ? query(
                `SELECT subject, exam_date, start_time, end_time, room
                 FROM exam_schedules WHERE class_id = $1 ORDER BY exam_date ASC, start_time ASC`,
                [classId]
            ).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),

            // 10. Timetable
            classId ? query(`
                SELECT day_of_week, subject, start_time, end_time, room, teacher_name
                FROM timetables WHERE class_id = $1
                ORDER BY CASE day_of_week
                    WHEN 'Saturday' THEN 1 WHEN 'Sunday' THEN 2 WHEN 'Monday' THEN 3
                    WHEN 'Tuesday' THEN 4 WHEN 'Wednesday' THEN 5 WHEN 'Thursday' THEN 6 WHEN 'Friday' THEN 7
                END, start_time ASC
            `, [classId]).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),

            // 11. Class Exams Definitions (cached per class)
            classId ? getCached(`class_exams_${classId}`, 30000, async () => {
                const { rows } = await query(`
                    SELECT e.id, e.name, e.exam_key, e.max_score, e.sort_order
                    FROM class_exams ce
                    JOIN exams e ON ce.exam_id = e.id
                    WHERE ce.class_id = $1 AND e.deleted_at IS NULL
                    ORDER BY e.sort_order ASC, e.id ASC
                `, [classId]).catch(() => ({ rows: [] }));
                if (rows.length > 0) return rows;
                const { rows: fallback } = await query(
                    `SELECT id, name, exam_key, max_score, sort_order FROM exams WHERE deleted_at IS NULL ORDER BY sort_order ASC`
                ).catch(() => ({ rows: [] }));
                return fallback;
            }) : getCached('all_exams_fallback', 30000, async () => {
                const { rows } = await query(
                    `SELECT id, name, exam_key, max_score, sort_order FROM exams WHERE deleted_at IS NULL ORDER BY sort_order ASC`
                ).catch(() => ({ rows: [] }));
                return rows;
            }),

            // 12. Announcements (cached 30s)
            getCached('announcements_students', 30000, async () => {
                const { rows } = await query(`
                    SELECT id, title, message, category, audience, created_by, image_url,
                           title_so, message_so, title_ar, message_ar,
                           COALESCE(publish_date, created_at::date) as publish_date, created_at
                    FROM announcements
                    WHERE deleted_at IS NULL AND (audience = 'all' OR audience = 'students')
                    ORDER BY COALESCE(publish_date, created_at::date) DESC, id DESC
                    LIMIT 10
                `).catch(() => ({ rows: [] }));
                return rows;
            }),

            // 13. Top 3 Class Leaders
            classId ? query(`
                SELECT s.id AS student_id, s.name, s.image, s.grade, s.gpa,
                       COALESCE(SUM(r.score), 0) AS total_score,
                       COALESCE(AVG(r.score), 0) AS avg_score,
                       COALESCE(SUM(COALESCE(r.max_score, 100)), 0) AS total_max,
                       COUNT(r.id) AS subject_count
                FROM students s
                JOIN results r ON r.student_id = s.id
                LEFT JOIN exam_periods ep ON r.period_id = ep.id
                WHERE (s.classid = $1 OR s.id IN (SELECT student_id FROM class_students WHERE class_id = $1))
                  AND s.deleted_at IS NULL
                  AND r.approval_status = 'approved'
                  AND r.deleted_at IS NULL
                  AND (r.period_id IS NULL OR (ep.deleted_at IS NULL AND ep.is_published = true ${!allowArchived ? 'AND (ep.is_archived = false OR ep.is_archived IS NULL)' : ''}))
                GROUP BY s.id, s.name, s.image, s.grade, s.gpa
                HAVING COUNT(r.id) > 0
                ORDER BY total_score DESC, avg_score DESC
                LIMIT 3
            `, [classId]).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),

            // 14. Exam Periods for filter
            query(`
                SELECT ep.id, ep.name, ep.year, ep.month, ep.period_type, ep.academic_year,
                       ep.is_active, ep.is_archived, ep.is_locked, ep.is_published,
                       (SELECT COUNT(*) FROM results r WHERE r.period_id = ep.id AND r.student_id = $1 AND r.deleted_at IS NULL AND r.approval_status = 'approved') AS my_result_count
                FROM exam_periods ep
                WHERE ep.deleted_at IS NULL AND ep.is_published = true ${!allowArchived ? 'AND (ep.is_archived = false OR ep.is_archived IS NULL)' : ''}
                ORDER BY ep.year DESC, ep.month ASC NULLS LAST
            `, [studentId]).catch(() => ({ rows: [] })),

            // 15. Certificates
            query(`
                SELECT id, title, cert_type, certificate_number, academic_year, issue_date, description, file_path, uploaded_at
                FROM certificates
                WHERE student_id = $1 AND is_available = true AND (is_published = true OR is_published IS NULL) AND deleted_at IS NULL
                ORDER BY issue_date DESC, uploaded_at DESC
            `, [studentId]).catch(() => ({ rows: [] })),

            // 16. Digital Library (cached 60s)
            getCached(`books_${isAlumni ? 'alumni' : 'student'}`, 60000, async () => {
                const audienceFilter = isAlumni ? `AND target_audience IN ('all', 'alumni')` : ``;
                const { rows } = await query(`
                    SELECT id, title, author, isbn, category, subject, academic_year, file_path, file_type, cover, status, description, digitallink
                    FROM books 
                    WHERE deleted_at IS NULL AND (is_published = true OR is_published IS NULL) AND is_archived = false ${audienceFilter}
                    ORDER BY title ASC LIMIT 60
                `).catch(() => ({ rows: [] }));
                return rows;
            })
        ]);

        // Process Results
        const resultRows = resultsRes.rows || [];
        const holdRows = holdRes.rows || [];
        let resultsOnHold = false;
        let releaseAt = null;

        // A hold on an old exam must NEVER block a student who has approved results in their active exam!
        if (holdRows.length > 0 && resultRows.length === 0) {
            resultsOnHold = true;
            releaseAt = holdRows[0].release_at || null;
        }

        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const distinctPeriods = new Set(resultRows.map(r => r.period_id).filter(Boolean));
        const results = {};
        const monthlyExamResults = {};

        resultRows.forEach(r => {
            const exId = r.period_id || 0;
            const exName = r.period_name || 'General Assessment';
            const exCode = r.exam_code || `EXAM-${exId}`;
            const exMonth = r.month;
            const exYear = r.year;

            if (!monthlyExamResults[exId]) {
                monthlyExamResults[exId] = {
                    examId: exId,
                    examName: exName,
                    month: exMonth,
                    year: exYear,
                    examCode: exCode,
                    totalMarks: parseFloat(r.total_marks) || 100,
                    subjects: {},
                    overallPercentage: 0,
                    overallGrade: 'N/A'
                };
            }

            if (!monthlyExamResults[exId].subjects[r.subject]) {
                monthlyExamResults[exId].subjects[r.subject] = {
                    subject: r.subject,
                    scores: {},
                    components: [],
                    total: 0,
                    maxTotal: 0,
                    remarks: r.remarks || ''
                };
            }

            const score = parseFloat(r.score) || 0;
            const maxScore = parseFloat(r.max_score) || 100;
            const compKey = r.exam_type || 'score';
            const compName = r.component_name || r.exam_type || 'Score';

            monthlyExamResults[exId].subjects[r.subject].scores[compKey] = score;
            monthlyExamResults[exId].subjects[r.subject].components.push({
                name: compName,
                key: compKey,
                score,
                maxScore
            });
            monthlyExamResults[exId].subjects[r.subject].total += score;
            monthlyExamResults[exId].subjects[r.subject].maxTotal += maxScore;

            // Grouped subject mapping
            let displaySubject = r.subject || 'Unknown Subject';
            if (distinctPeriods.size > 1) {
                if (r.period_name) {
                    displaySubject += ` (${r.period_name})`;
                } else if (r.month && r.year) {
                    displaySubject += ` (${months[r.month-1]} ${r.year})`;
                }
            }
            if (!results[displaySubject]) {
                results[displaySubject] = { scores: {}, total: 0, maxTotal: 0 };
            }
            results[displaySubject].scores[compKey] = score;
            results[displaySubject].maxScores = results[displaySubject].maxScores || {};
            results[displaySubject].maxScores[compKey] = maxScore;
            results[displaySubject].total += score;
            results[displaySubject].maxTotal += maxScore;
        });

        // Calculate overall percentage and grade for each monthly exam
        for (const exId of Object.keys(monthlyExamResults)) {
            const ex = monthlyExamResults[exId];
            const subjs = Object.values(ex.subjects);
            let totScore = 0;
            let totMax = 0;
            subjs.forEach(s => {
                s.percentage = s.maxTotal > 0 ? Math.round((s.total / s.maxTotal) * 100) : 0;
                s.grade = s.percentage >= 90 ? 'A+' : (s.percentage >= 80 ? 'A' : (s.percentage >= 70 ? 'B' : (s.percentage >= 60 ? 'C' : (s.percentage >= 50 ? 'D' : 'F'))));
                totScore += s.total;
                totMax += s.maxTotal;
            });
            ex.overallPercentage = totMax > 0 ? Math.round((totScore / totMax) * 100) : 0;
            ex.overallGrade = ex.overallPercentage >= 90 ? 'A+' : (ex.overallPercentage >= 80 ? 'A' : (ex.overallPercentage >= 70 ? 'B' : (ex.overallPercentage >= 60 ? 'C' : (ex.overallPercentage >= 50 ? 'D' : 'F'))));
        }

        // Attendance stats
        const attStatsRow = attendanceStatsRes.rows && attendanceStatsRes.rows[0];
        const totalDays = attStatsRow ? (parseInt(attStatsRow.total_days) || 0) : 0;
        const presentCount = attStatsRow ? (parseInt(attStatsRow.present_count) || 0) : 0;
        const attendance = {
            totalDays,
            presentCount,
            absentCount: attStatsRow ? (parseInt(attStatsRow.absent_count) || 0) : 0,
            leaveCount: attStatsRow ? (parseInt(attStatsRow.leave_count) || 0) : 0,
            percentage: totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 0
        };

        // Clearance
        const clearanceRows = clearanceRes.rows || [];
        const feeRows = unpaidFeesRes.rows || [];
        const unpaidCount = feeRows[0] ? parseInt(feeRows[0].unpaid_count || 0) : 0;
        let clearance = { isCleared: false };
        if (clearanceRows.length > 0) {
            const c = clearanceRows[0];
            const isCleared = c.is_cleared || (unpaidCount === 0);
            clearance = {
                isCleared: !!isCleared,
                released_by: c.released_by || (unpaidCount === 0 ? 'Fee Clearance System' : 'Admin'),
                released_at: c.released_at || new Date(),
                semester: c.semester || 'Current Semester'
            };
        } else {
            clearance = {
                isCleared: unpaidCount === 0,
                released_by: unpaidCount === 0 ? 'Fee Clearance System' : null,
                released_at: unpaidCount === 0 ? new Date() : null,
                semester: 'Current Semester'
            };
        }

        // Class Leaders
        let classLeaders = [];
        if (classInfo && !resultsOnHold && classLeadersRes.rows) {
            classLeaders = classLeadersRes.rows.map((r, idx) => ({
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
        }

        // Exam Periods
        const MONTHS_ARR = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const periodRows = periodsRes.rows || [];
        const examPeriods = periodRows.map(p => ({
            id: p.id,
            name: p.name,
            year: p.year,
            month: p.month,
            period_type: p.period_type,
            academic_year: p.academic_year,
            is_active: p.is_active,
            is_archived: p.is_archived,
            is_locked: p.is_locked,
            is_published: p.is_published,
            month_name: p.month ? MONTHS_ARR[p.month - 1] : null,
            my_result_count: parseInt(p.my_result_count) || 0
        }));

        const displayId = student.student_id_code || ('BB' + String(260000 + student.id).padStart(6, '0'));

        // Send lightning fast payload
        res.json({
            student: {
                id: student.id,
                bbId: displayId,
                elpId: displayId,
                student_id_code: displayId,
                name: student.name,
                grade: student.grade,
                department: student.department || '--',
                period: student.period || '--',
                status: student.status || 'Active',
                academic_year: student.academic_year || '2026',
                isAlumni,
                role: isAlumni ? 'Alumni' : 'Student',
                enrollmentdate: student.enrollmentdate_clean || student.enrollmentdate,
                birthdate: student.birthdate_clean || student.birthdate,
                gpa: student.gpa,
                remarks: student.remarks
            },
            results,
            monthlyExamResults,
            resultsOnHold,
            releaseAt,
            exams: examsRes || [],
            classLeaders,
            attendance,
            attendanceHistory: attendanceHistoryRes.rows || [],
            class: classInfo,
            subjects: subjectsRes.rows || [],
            fees: feesRes.rows || [],
            clearance,
            examSchedule: examScheduleRes.rows || [],
            timetable: timetableRes.rows || [],
            announcements: announcementsRes || [],
            examPeriods,
            certificates: certsRes.rows || [],
            books: booksRes || [],
            allowStudentsViewArchivedExams: allowArchived
        });
    } catch (err) {
        console.error('[Student Dashboard Error]', err);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:studentId/results-filter - Multi-criteria result filtering
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:studentId/results-filter', async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) return res.status(400).json({ error: 'Invalid student ID' });

    const allowArchived = await getArchivedExamsAllowed();
    const { academic_year, exam_type, month, period_id, subject } = req.query;

    try {
        let sql = `
            SELECT r.id, r.subject, r.exam_type, r.score, r.max_score, r.remarks, r.approval_status,
                   r.academic_year, e.name AS exam_name, r.submitted_at,
                   ep.id AS period_id, ep.name AS period_name, ep.period_type, ep.year AS period_year, ep.month AS period_month
            FROM results r
            LEFT JOIN exams e ON e.exam_key = r.exam_type AND e.deleted_at IS NULL
            LEFT JOIN exam_periods ep ON ep.id = r.period_id
            WHERE r.student_id = $1 
              AND r.deleted_at IS NULL 
              AND r.approval_status = 'approved'
              AND (r.period_id IS NULL OR (ep.deleted_at IS NULL AND ep.is_published = true ${!allowArchived ? 'AND (ep.is_archived = false OR ep.is_archived IS NULL)' : ''}))
        `;
        const params = [studentId];
        let idx = 2;

        if (academic_year && academic_year !== 'all') {
            sql += ` AND (r.academic_year = $${idx} OR ep.academic_year = $${idx} OR ep.year = CAST($${idx} AS INT))`;
            params.push(academic_year);
            idx++;
        }
        if (period_id && period_id !== 'all') {
            sql += ` AND r.period_id = $${idx++}`;
            params.push(parseInt(period_id));
        }
        if (exam_type && exam_type !== 'all') {
            sql += ` AND (LOWER(r.exam_type) = LOWER($${idx}) OR LOWER(ep.period_type) = LOWER($${idx}))`;
            params.push(exam_type);
            idx++;
        }
        if (month && month !== 'all') {
            sql += ` AND ep.month = $${idx++}`;
            params.push(parseInt(month));
        }
        if (subject && subject !== 'all') {
            sql += ` AND LOWER(r.subject) = LOWER($${idx++})`;
            params.push(subject);
        }

        sql += ` ORDER BY r.subject ASC, r.submitted_at ASC`;
        const { rows } = await query(sql, params);

        const grouped = {};
        rows.forEach(r => {
            if (!grouped[r.subject]) {
                grouped[r.subject] = { scores: {}, maxScores: {}, total: 0, maxTotal: 0, periodName: r.period_name };
            }
            const score = parseFloat(r.score) || 0;
            const maxScore = parseFloat(r.max_score) || 100;
            grouped[r.subject].scores[r.exam_type] = score;
            grouped[r.subject].maxScores[r.exam_type] = maxScore;
            grouped[r.subject].total += score;
            grouped[r.subject].maxTotal += maxScore;
        });

        res.json({ results: grouped, rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:studentId/period/:periodId - Single period results (parallelized)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:studentId/period/:periodId', async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    const periodId = parseInt(req.params.periodId);
    if (isNaN(studentId) || isNaN(periodId)) return res.status(400).json({ error: 'Invalid IDs' });

    try {
        const [allowArchived, periodCheckRes] = await Promise.all([
            getArchivedExamsAllowed(),
            query(`SELECT id, name, is_published, is_archived FROM exam_periods WHERE id = $1 AND deleted_at IS NULL`, [periodId])
        ]);

        const periodCheck = periodCheckRes.rows;
        if (!periodCheck[0] || !periodCheck[0].is_published) {
            return res.json({ results: {}, rows: [], components: [], message: 'Results for this exam period have not been released yet.' });
        }

        if (periodCheck[0].is_archived && !allowArchived) {
            return res.json({ results: {}, rows: [], components: [], message: 'Archived exam results are currently hidden by administration.' });
        }

        // Run results and components concurrently
        const [rowsRes, compsRes] = await Promise.all([
            query(`
                SELECT r.id, r.subject, r.exam_type, r.score, r.max_score, r.remarks, r.approval_status,
                       COALESCE(ec.name, e.name, r.component_name, r.exam_type) AS exam_name,
                       COALESCE(ec.max_marks, r.max_score, 100) AS component_max,
                       r.submitted_at
                FROM results r
                LEFT JOIN exam_components ec ON ec.id = r.component_id
                LEFT JOIN exams e ON e.exam_key = r.exam_type AND e.deleted_at IS NULL
                WHERE r.period_id = $1 AND r.student_id = $2 AND r.deleted_at IS NULL AND r.approval_status = 'approved'
                ORDER BY r.subject, r.submitted_at
            `, [periodId, studentId]),
            query(`
                SELECT id, name, component_key, max_marks, order_num
                FROM exam_components WHERE exam_id = $1 AND deleted_at IS NULL
                ORDER BY order_num ASC
            `, [periodId])
        ]);

        const rows = rowsRes.rows || [];
        const comps = compsRes.rows || [];

        const grouped = {};
        rows.forEach(r => {
            if (!grouped[r.subject]) grouped[r.subject] = { scores: {}, maxScores: {}, total: 0, maxTotal: 0 };
            const score = parseFloat(r.score) || 0;
            const maxScore = parseFloat(r.component_max) || parseFloat(r.max_score) || 0;
            grouped[r.subject].scores[r.exam_type] = score;
            grouped[r.subject].maxScores[r.exam_type] = maxScore;
            grouped[r.subject].total += score;
            grouped[r.subject].maxTotal += maxScore;
        });

        res.json({ results: grouped, rows, components: comps });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
