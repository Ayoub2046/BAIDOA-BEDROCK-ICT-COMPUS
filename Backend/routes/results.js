// Backend/routes/results.js

const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { query, pool } = require('../database.js');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

// Exam type definitions with max scores
const EXAM_TYPES = {
    quiz1: { label: 'Quiz 1', maxScore: 5, category: 'Quiz', order: 1 },
    quiz2: { label: 'Quiz 2', maxScore: 5, category: 'Quiz', order: 2 },
    sem1: { label: 'Semester 1', maxScore: 5, category: 'Semester', order: 3 },
    sem2: { label: 'Semester 2', maxScore: 5, category: 'Semester', order: 4 },
    midterm: { label: 'Midterm', maxScore: 40, category: 'Midterm', order: 5 },
    final: { label: 'Final', maxScore: 40, category: 'Final', order: 6 }
};

// GET exam type definitions
router.get('/exam-types/definitions', async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT exam_key, name, max_score, sort_order FROM exams WHERE deleted_at IS NULL ORDER BY sort_order ASC`
        );
        if (rows.length > 0) {
            const defs = {};
            rows.forEach(r => { defs[r.exam_key] = { label: r.name, maxScore: parseFloat(r.max_score), order: r.sort_order }; });
            return res.json(defs);
        }
    } catch (e) { /* fall through to defaults */ }
    res.json(EXAM_TYPES);
});

// Helper: get the max score for an exam from the DB (fallback to defaults)
async function getExamMaxScore(examKey) {
    try {
        const { rows } = await query(
            `SELECT max_score FROM exams WHERE exam_key = $1 AND deleted_at IS NULL LIMIT 1`,
            [examKey]
        );
        if (rows[0]) return parseFloat(rows[0].max_score);
    } catch (e) { }
    return EXAM_TYPES[examKey]?.maxScore || 100;
}

// GET top 3 class leaders in a class (honor roll / leaderboard)
router.get('/class-leaders/:classId', async (req, res) => {
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID' });
    const examType = req.query.examType || null;
    try {
        // Query top students with approved results in this class
        let sql = `
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
              AND (r.period_id IS NULL OR r.period_id IN (SELECT id FROM exam_periods WHERE is_published = true AND deleted_at IS NULL))
        `;
        const params = [classId];
        if (examType && examType.trim() !== '') {
            sql += ` AND r.exam_type = $2`;
            params.push(examType.trim());
        }
        sql += `
            GROUP BY s.id, s.name, s.image, s.grade, s.gpa
            HAVING COUNT(r.id) > 0
            ORDER BY total_score DESC, avg_score DESC
            LIMIT 10
        `;
        const { rows } = await query(sql, params);

        // Check if any results for this class and exam are on hold
        let onHold = false;
        try {
            let holdSql = `
                SELECT r.id FROM results r
                JOIN students s ON r.student_id = s.id
                WHERE (s.classid = $1 OR s.id IN (SELECT student_id FROM class_students WHERE class_id = $1))
                  AND r.approval_status = 'on_hold'
                  AND r.deleted_at IS NULL
            `;
            const holdParams = [classId];
            if (examType && examType.trim() !== '') {
                holdSql += ` AND r.exam_type = $2`;
                holdParams.push(examType.trim());
            }
            holdSql += ` LIMIT 1`;
            const { rows: holdRows } = await query(holdSql, holdParams);
            if (holdRows.length > 0) onHold = true;
        } catch (e) {}

        const leaders = rows.map((r, idx) => {
            const tot = parseFloat(r.total_score) || 0;
            const mx = parseFloat(r.total_max) || 0;
            const pct = mx > 0 ? Math.round((tot / mx) * 100) : 0;
            return {
                rank: idx + 1,
                studentId: r.student_id,
                bbId: `BB${String(260000 + r.student_id).slice(-6)}`,
                elpId: `BB${String(260000 + r.student_id).slice(-6)}`,
                name: r.name,
                image: r.image,
                grade: r.grade || 'A',
                gpa: r.gpa,
                totalScore: tot % 1 === 0 ? tot : tot.toFixed(1),
                totalMax: mx % 1 === 0 ? mx : mx.toFixed(1),
                avgScore: (parseFloat(r.avg_score) || 0).toFixed(1),
                percentage: pct,
                subjectCount: parseInt(r.subject_count) || 0
            };
        });

        res.json({
            classId,
            examType,
            onHold,
            isPublished: !onHold && leaders.length > 0,
            leaders: leaders.slice(0, 3),
            allLeaders: leaders
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/results/leaderboards
// Returns:
// 1. Schoolwide Top 3 (Overall Champions across all classes)
// 2. Class Champions (1st place in every class)
// 3. Top 3 for every participating class
// 4. Detailed leaderboard ranking table
// 5. Summary metrics (total classes, finalized classes, distinct champions, eligible students)
router.get('/leaderboards', async (req, res) => {
    try {
        const { periodId, academicYear, classId, subject, status } = req.query;
        let targetPeriodId = periodId ? parseInt(periodId) : null;

        // If no period provided, get the active or latest published exam period
        if (!targetPeriodId) {
            const { rows: pRows } = await query(`
                SELECT id FROM exam_periods 
                WHERE deleted_at IS NULL AND (is_active = true OR is_published = true)
                ORDER BY is_active DESC, year DESC, month DESC, id DESC LIMIT 1
            `);
            if (pRows[0]) targetPeriodId = pRows[0].id;
        }

        // Fetch period metadata
        let periodInfo = null;
        if (targetPeriodId) {
            const { rows: pi } = await query(
                `SELECT id, name, academic_year, is_published, is_locked, status, year, month FROM exam_periods WHERE id = $1`,
                [targetPeriodId]
            );
            periodInfo = pi[0] || null;
        }

        // Filter parameters
        const params = [];
        let whereClauses = [
            `r.deleted_at IS NULL`,
            `s.deleted_at IS NULL`
        ];

        // Approval status filter: default to approved for official leaderboards
        const approvalFilter = status || 'approved';
        if (approvalFilter !== 'all') {
            params.push(approvalFilter);
            whereClauses.push(`r.approval_status = $${params.length}`);
        }

        if (targetPeriodId) {
            params.push(targetPeriodId);
            whereClauses.push(`r.period_id = $${params.length}`);
        }

        if (academicYear) {
            params.push(academicYear);
            whereClauses.push(`(r.academic_year = $${params.length} OR s.academic_year = $${params.length})`);
        }

        if (subject && subject !== 'all') {
            params.push(subject.trim());
            whereClauses.push(`LOWER(r.subject) = LOWER($${params.length})`);
        }

        // Specific class filter if selected
        const filterClassId = classId && classId !== 'all' ? parseInt(classId) : null;

        // Query all eligible students with marks in this assessment scope
        const sql = `
            SELECT s.id AS student_id,
                   s.name,
                   s.image,
                   s.grade,
                   s.gpa,
                   COALESCE(s.classid, 0) AS class_id,
                   COALESCE(c.name, 'Unassigned') AS class_name,
                   ('BB' || LPAD((260000 + s.id)::TEXT, 6, '0')) AS bb_id,
                   COALESCE(SUM(r.score), 0) AS total_score,
                   COALESCE(SUM(COALESCE(r.max_score, 100)), 0) AS total_max,
                   ROUND((COALESCE(SUM(r.score), 0) / NULLIF(SUM(COALESCE(r.max_score, 100)), 0)) * 100, 1) AS percentage,
                   COUNT(r.id) AS subject_count,
                   BOOL_AND(r.approval_status = 'approved') AS is_all_approved
            FROM students s
            LEFT JOIN classes c ON c.id = s.classid
            JOIN results r ON r.student_id = s.id
            WHERE ${whereClauses.join(' AND ')}
            GROUP BY s.id, s.name, s.image, s.grade, s.gpa, s.classid, c.name
            HAVING COUNT(r.id) > 0
            ORDER BY total_score DESC, percentage DESC, s.name ASC
        `;

        const { rows: allRankedStudents } = await query(sql, params);

        // Grade calculation helper
        function calculateGrade(pct) {
            if (pct >= 90) return 'A+';
            if (pct >= 85) return 'A';
            if (pct >= 80) return 'A-';
            if (pct >= 75) return 'B+';
            if (pct >= 70) return 'B';
            if (pct >= 65) return 'B-';
            if (pct >= 60) return 'C+';
            if (pct >= 50) return 'C';
            return 'F';
        }

        // Format each student record
        const validGradeLetters = new Set(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F']);
        const formattedStudents = allRankedStudents.map((st, idx) => {
            const tot = parseFloat(st.total_score) || 0;
            const mx = parseFloat(st.total_max) || 0;
            const pct = mx > 0 ? parseFloat(st.percentage) || Math.round((tot / mx) * 1000) / 10 : 0;
            const cleanGrade = (st.grade && validGradeLetters.has(st.grade.trim().toUpperCase()))
                ? st.grade.trim().toUpperCase()
                : calculateGrade(pct);

            const studentName = (st.name || '').trim();
            const studentImage = st.image || '/images/BEDRCOK LOGO.JPG';
            const className = st.class_name || 'Unassigned';
            const bbId = st.bb_id || ('BB' + (260000 + st.student_id));
            const scoreFormatted = tot % 1 === 0 ? tot : tot.toFixed(1);
            const maxFormatted = mx % 1 === 0 ? mx : mx.toFixed(1);

            return {
                overallRank: idx + 1,
                rank: idx + 1,
                studentId: st.student_id,
                student_id: st.student_id,
                name: studentName,
                student_name: studentName,
                image: studentImage,
                student_image: studentImage,
                classId: st.class_id,
                class_id: st.class_id,
                className: className,
                class_name: className,
                bbId: bbId,
                bb_id: bbId,
                totalScore: scoreFormatted,
                total_score: scoreFormatted,
                totalMax: maxFormatted,
                total_max: maxFormatted,
                percentage: pct,
                grade: cleanGrade,
                gpa: st.gpa,
                componentCount: parseInt(st.subject_count) || 0,
                isApproved: st.is_all_approved
            };
        });

        // 1. Overall School Champions (Top 3 across entire school)
        // Handle ties gracefully: if tie for 1st or 2nd, include tied positions
        let overallSchoolTop3 = [];
        if (formattedStudents.length > 0) {
            let currentRank = 1;
            for (let i = 0; i < formattedStudents.length; i++) {
                if (i > 0 && formattedStudents[i].totalScore < formattedStudents[i - 1].totalScore) {
                    currentRank = i + 1;
                }
                if (currentRank > 3) break;
                overallSchoolTop3.push({
                    ...formattedStudents[i],
                    rank: currentRank
                });
            }
        }

        // 2. Class-by-Class Grouping & Rankings
        const { rows: allClasses } = await query(`
            SELECT id, name FROM classes WHERE deleted_at IS NULL ORDER BY id ASC
        `);

        const classHonorRolls = [];
        const classChampions = [];
        const championStudentIds = new Set();

        for (const cls of allClasses) {
            if (filterClassId && cls.id !== filterClassId) continue;

            const studentsInClass = formattedStudents.filter(s => s.classId === cls.id);
            if (studentsInClass.length === 0) continue;

            // Rank within class with transparent tie handling
            const rankedClassStudents = [];
            let classRank = 1;
            for (let i = 0; i < studentsInClass.length; i++) {
                if (i > 0 && studentsInClass[i].totalScore < studentsInClass[i - 1].totalScore) {
                    classRank = i + 1;
                }
                rankedClassStudents.push({
                    ...studentsInClass[i],
                    classRank
                });
            }

            // Top 3 in this class
            const classTop3 = rankedClassStudents
                .filter(s => s.classRank <= 3)
                .map(s => ({
                    ...s,
                    rank: s.classRank,
                    classRank: s.classRank,
                    class_rank: s.classRank
                }));

            // First-place champions for this class
            const firstPlace = rankedClassStudents.filter(s => s.classRank === 1);
            firstPlace.forEach(champ => {
                classChampions.push({
                    ...champ,
                    rank: 1,
                    classRank: 1,
                    class_rank: 1,
                    examName: periodInfo ? periodInfo.name : 'Current Exam',
                    academicYear: periodInfo ? periodInfo.academic_year : '2026'
                });
                championStudentIds.add(champ.studentId);
            });

            classHonorRolls.push({
                classId: cls.id,
                className: cls.name,
                participatingCount: studentsInClass.length,
                top3: classTop3,
                allClassStudents: rankedClassStudents
            });
        }

        // Summary statistics
        const summary = {
            totalClassesParticipating: classHonorRolls.length,
            classesWithFinalizedRankings: classHonorRolls.filter(c => c.top3.length > 0).length,
            totalFirstPlaceAwards: classChampions.length,
            distinctFirstPlaceStudents: championStudentIds.size,
            totalEligibleStudents: formattedStudents.length,
            isOfficiallyPublished: periodInfo ? (periodInfo.is_published === true) : true,
            examName: periodInfo ? periodInfo.name : 'All Exams',
            academicYear: periodInfo ? periodInfo.academic_year : '2026'
        };

        res.json({
            periodId: targetPeriodId,
            periodInfo,
            summary,
            schoolwideTop3: overallSchoolTop3,
            classChampions,
            classHonorRolls,
            detailedRankings: filterClassId ? formattedStudents.filter(s => s.classId === filterClassId) : formattedStudents
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET results for a class and subject (to populate existing scores & lock status for teacher)
// Scoped by periodId / examId to prevent marks leaking across different exams
router.get('/class/:classId/subject/:subject', async (req, res) => {
    const { classId, subject } = req.params;
    const periodId = req.query.periodId ? parseInt(req.query.periodId) : (req.query.examId ? parseInt(req.query.examId) : null);
    try {
        let isExamLocked = false;
        let examStatus = 'open';
        if (periodId) {
            const { rows: examRows } = await query(
                `SELECT status, is_locked FROM exam_periods WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
                [periodId]
            );
            if (examRows[0]) {
                examStatus = examRows[0].status || (examRows[0].is_locked ? 'locked' : 'open');
                isExamLocked = examRows[0].is_locked === true || examStatus === 'locked' || examStatus === 'closed';
            }
        }

        const { rows } = await query(`
            SELECT r.id, r.student_id, r.subject, r.score, r.exam_type, r.max_score, r.remarks,
                   r.approval_status, r.edit_allowed, r.submitted_at, r.period_id,
                   r.component_id, r.component_name
            FROM results r
            JOIN students s ON r.student_id = s.id
            WHERE (s.classid = $1 OR s.id IN (SELECT student_id FROM class_students WHERE class_id = $1))
              AND LOWER(r.subject) = LOWER($2)
              AND ($3::INTEGER IS NULL OR r.period_id = $3)
              AND r.deleted_at IS NULL
            ORDER BY r.student_id ASC, r.id ASC
        `, [classId, subject, periodId]);

        res.json(rows.map(r => ({
            ...r,
            exam_locked: isExamLocked,
            exam_status: examStatus
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET approved results for a specific student (for student/parent view)
// Optional ?examType= filter returns results for a single exam only
router.get('/:studentId', async (req, res) => {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) return res.status(400).json({ error: 'Invalid student ID' });
    const examType = req.query.examType || null;
    try {
        const { rows: studentRows } = await query(`SELECT * FROM students WHERE id = $1`, [studentId]);
        const student = studentRows[0];
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        let subjects = [];
        try {
            const subjectsRes = examType
                ? await query(
                    `SELECT subject, score, exam_type FROM results WHERE student_id = $1 AND approval_status = 'approved' AND deleted_at IS NULL AND exam_type = $2 AND (period_id IS NULL OR period_id IN (SELECT id FROM exam_periods WHERE is_published = true AND deleted_at IS NULL))`,
                    [studentId, examType]
                )
                : await query(
                    `SELECT subject, score, exam_type FROM results WHERE student_id = $1 AND approval_status = 'approved' AND deleted_at IS NULL AND (period_id IS NULL OR period_id IN (SELECT id FROM exam_periods WHERE is_published = true AND deleted_at IS NULL))`,
                    [studentId]
                );
            subjects = subjectsRes.rows;
        } catch (e) { }

        // Group results by subject, then by exam type
        const groupedResults = {};
        subjects.forEach(item => {
            if (!groupedResults[item.subject]) {
                groupedResults[item.subject] = {};
            }
            groupedResults[item.subject][item.exam_type || 'score'] = parseFloat(item.score);
        });

        // Calculate totals for each subject
        const calculatedResults = {};
        for (const [subject, scores] of Object.entries(groupedResults)) {
            const total = Object.values(scores).reduce((sum, s) => sum + s, 0);
            calculatedResults[subject] = {
                scores,
                total,
                maxTotal: 100
            };
        }

        const fullResult = {
            ...student,
            subjects: calculatedResults,
            examTypes: EXAM_TYPES
        };
        res.json(fullResult);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET all results (admin view - with multi-year & period filtering)
router.get('/', async (req, res) => {
    try {
        const periodId = req.query.periodId ? parseInt(req.query.periodId) : null;
        const academicYear = req.query.academic_year || req.query.academicYear || null;
        const classId = req.query.classId || req.query.class_id ? parseInt(req.query.classId || req.query.class_id) : null;
        const approvalStatus = req.query.status || req.query.approval_status || null;
        const studentId = req.query.studentId || req.query.student_id ? parseInt(req.query.studentId || req.query.student_id) : null;
        const subject = req.query.subject ? req.query.subject.trim() : null;
        const search = req.query.search ? req.query.search.trim().toLowerCase() : null;
        const attendanceStatus = req.query.attendance_status || req.query.attendanceStatus || null;
        const teacherId = req.query.teacherId ? parseInt(req.query.teacherId) : null;

        let sql = `
            SELECT r.id, r.student_id, r.subject, r.score, r.max_score, r.exam_type, r.approval_status, 
                   r.submitted_by, r.submitted_at, r.edit_allowed, r.academic_year, r.is_locked,
                   r.period_id, ep.name AS period_name, ep.year AS period_year, ep.month AS period_month,
                   s.name AS "studentName", s.student_id_code, s.grade,
                   c.name AS class_name, c.id AS class_id,
                   COALESCE(ea.status, 'attended') AS attendance_status
            FROM results r
            JOIN students s ON r.student_id = s.id
            LEFT JOIN classes c ON c.id = s.classid
            LEFT JOIN exam_periods ep ON r.period_id = ep.id
            LEFT JOIN exam_attendance ea ON (ea.student_id = r.student_id AND ea.period_id = r.period_id AND LOWER(ea.subject) = LOWER(r.subject))
            WHERE r.deleted_at IS NULL
        `;
        const params = [];
        let idx = 1;

        if (periodId) {
            sql += ` AND r.period_id = $${idx++}`;
            params.push(periodId);
        }
        if (academicYear && academicYear !== 'all') {
            sql += ` AND (r.academic_year = $${idx} OR ep.academic_year = $${idx} OR ep.year = CAST($${idx} AS INT))`;
            params.push(academicYear);
            idx++;
        }
        if (classId && classId !== 'all') {
            sql += ` AND s.classid = $${idx++}`;
            params.push(classId);
        }
        if (approvalStatus && approvalStatus !== 'all') {
            sql += ` AND r.approval_status = $${idx++}`;
            params.push(approvalStatus);
        }
        if (studentId) {
            sql += ` AND r.student_id = $${idx++}`;
            params.push(studentId);
        }
        if (subject && subject !== 'all') {
            sql += ` AND LOWER(r.subject) = LOWER($${idx++})`;
            params.push(subject);
        }
        if (attendanceStatus && attendanceStatus !== 'all') {
            sql += ` AND ea.status = $${idx++}`;
            params.push(attendanceStatus);
        }
        if (search) {
            sql += ` AND (LOWER(s.name) LIKE $${idx} OR LOWER(COALESCE(s.student_id_code, '')) LIKE $${idx} OR LOWER(COALESCE(c.name, '')) LIKE $${idx})`;
            params.push(`%${search}%`);
            idx++;
        }
        if (teacherId && !isNaN(teacherId)) {
            sql += ` AND (c.teacherid = $${idx} OR s.classid IN (SELECT id FROM classes WHERE teacherid = $${idx}))`;
            params.push(teacherId);
            idx++;
        }

        sql += ` ORDER BY r.submitted_at DESC, r.student_id`;
        const { rows } = await query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/results/stats - Return accurate, unique-student statistics
router.get('/stats', async (req, res) => {
    try {
        const classId = req.query.classId || req.query.class_id ? parseInt(req.query.classId || req.query.class_id) : null;
        const periodId = req.query.periodId || req.query.period_id ? parseInt(req.query.periodId || req.query.period_id) : null;
        const academicYear = req.query.academic_year || req.query.academicYear || null;
        const subject = req.query.subject ? req.query.subject.trim() : null;
        const teacherId = req.query.teacherId ? parseInt(req.query.teacherId) : null;

        // 1. Total unique active students in selected class/school
        let stdSql = `
            SELECT COUNT(DISTINCT s.id)::int AS total 
            FROM students s 
            LEFT JOIN classes c ON c.id = s.classid 
            WHERE s.deleted_at IS NULL
        `;
        const stdParams = [];
        let sIdx = 1;
        if (classId && !isNaN(classId)) {
            stdSql += ` AND s.classid = $${sIdx++}`;
            stdParams.push(classId);
        }
        if (teacherId && !isNaN(teacherId)) {
            stdSql += ` AND (c.teacherid = $${sIdx} OR s.classid IN (SELECT id FROM classes WHERE teacherid = $${sIdx}))`;
            stdParams.push(teacherId);
            sIdx++;
        }
        const { rows: stdRows } = await query(stdSql, stdParams);
        const totalStudents = stdRows[0] ? stdRows[0].total : 0;

        // 2. Query results rows matching filters
        let resSql = `
            SELECT r.student_id, r.approval_status
            FROM results r
            JOIN students s ON s.id = r.student_id
            LEFT JOIN classes c ON c.id = s.classid
            LEFT JOIN exam_periods ep ON ep.id = r.period_id
            LEFT JOIN exam_attendance ea ON (ea.student_id = r.student_id AND ea.period_id = r.period_id AND LOWER(ea.subject) = LOWER(r.subject))
            WHERE r.deleted_at IS NULL
              AND (ea.status IS NULL OR ea.status = 'attended')
        `;
        const resParams = [];
        let rIdx = 1;
        if (classId && !isNaN(classId)) {
            resSql += ` AND s.classid = $${rIdx++}`;
            resParams.push(classId);
        }
        if (periodId && !isNaN(periodId)) {
            resSql += ` AND r.period_id = $${rIdx++}`;
            resParams.push(periodId);
        }
        if (academicYear && academicYear !== 'all') {
            resSql += ` AND (r.academic_year = $${rIdx} OR ep.academic_year = $${rIdx} OR ep.year = CAST($${rIdx} AS INT))`;
            resParams.push(academicYear);
            rIdx++;
        }
        if (subject && subject !== 'all') {
            resSql += ` AND LOWER(r.subject) = LOWER($${rIdx++})`;
            resParams.push(subject);
        }
        if (teacherId && !isNaN(teacherId)) {
            resSql += ` AND (c.teacherid = $${rIdx} OR s.classid IN (SELECT id FROM classes WHERE teacherid = $${rIdx}))`;
            resParams.push(teacherId);
            rIdx++;
        }

        const { rows: resRows } = await query(resSql, resParams);

        // Group unique students
        const studentStatusMap = {};
        resRows.forEach(row => {
            const cur = studentStatusMap[row.student_id];
            if (!cur) {
                studentStatusMap[row.student_id] = row.approval_status;
            } else if (row.approval_status === 'pending') {
                studentStatusMap[row.student_id] = 'pending';
            } else if (row.approval_status === 'on_hold' && cur !== 'pending') {
                studentStatusMap[row.student_id] = 'on_hold';
            }
        });

        const attendedStudents = Object.keys(studentStatusMap).length;
        let pending = 0;
        let onHold = 0;
        let approved = 0;
        let rejected = 0;

        Object.values(studentStatusMap).forEach(st => {
            if (st === 'pending') pending++;
            else if (st === 'on_hold') onHold++;
            else if (st === 'approved') approved++;
            else if (st === 'rejected') rejected++;
        });

        const didNotAttend = Math.max(0, totalStudents - attendedStudents);

        res.json({
            totalStudents,
            attended: attendedStudents,
            pending,
            onHold,
            approved,
            rejected,
            didNotAttend
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET pending results (admin view)
router.get('/pending/all', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT r.id, r.student_id, r.subject, r.score, r.exam_type, r.approval_status, r.submitted_by, r.submitted_at, r.edit_allowed,
                   r.period_id, ep.name AS period_name,
                   s.name AS "studentName", s.grade
            FROM results r
            JOIN students s ON r.student_id = s.id
            LEFT JOIN exam_periods ep ON r.period_id = ep.id
            WHERE r.approval_status = 'pending' AND r.deleted_at IS NULL
            ORDER BY r.submitted_at DESC, r.student_id
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET results by teacher (for teacher view)
router.get('/teacher/:teacherId', async (req, res) => {
    const teacherId = req.params.teacherId;
    try {
        // Match either integer ID or name in submitted_by
        const { rows } = await query(`
            SELECT r.id, r.student_id, r.subject, r.score, r.exam_type, r.approval_status, r.submitted_at, r.edit_allowed,
                   r.period_id, ep.name AS period_name,
                   s.name AS "studentName", s.grade
            FROM results r
            JOIN students s ON r.student_id = s.id
            LEFT JOIN exam_periods ep ON r.period_id = ep.id
            WHERE (r.submitted_by = $1 OR r.submitted_by = (SELECT name FROM users WHERE id = $2 LIMIT 1))
              AND r.deleted_at IS NULL
            ORDER BY r.submitted_at DESC, r.student_id
        `, [String(teacherId), parseInt(teacherId) || 0]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST (submit) a result from teacher (status = pending)
// RULE: Once submitted, teacher cannot re-submit the same exam+subject combo
//       unless admin has unlocked it (edit_allowed = true).
router.post('/', async (req, res) => {
    const { studentId, subject, examType, score, teacherId, teacherName, periodId } = req.body;
    if (!studentId || !subject) {
        return res.status(400).json({ error: 'studentId and subject are required.' });
    }
    if (!examType) {
        return res.status(400).json({ error: 'Please select an exam (examType) to record a result for.' });
    }
    try {
        let targetPeriodId = periodId ? parseInt(periodId) : null;
        if (!targetPeriodId) {
            try {
                const { rows: actP } = await query(`SELECT id FROM exam_periods WHERE is_active = true AND deleted_at IS NULL ORDER BY year DESC, month DESC LIMIT 1`);
                if (actP[0]) targetPeriodId = actP[0].id;
            } catch(e) {}
        }

        // Check if a result already exists for this student/subject/exam/period and is locked
        const { rows: existing } = await query(
            `SELECT id, approval_status, edit_allowed, score FROM results
             WHERE student_id = $1 AND lower(subject) = lower($2) AND exam_type = $3
               AND ($4::INTEGER IS NULL OR period_id = $4) AND deleted_at IS NULL
             ORDER BY id DESC LIMIT 1`,
            [studentId, subject, examType, targetPeriodId]
        );
        if (existing[0]) {
            const rec = existing[0];
            // If approved/pending and not unlocked → block
            if (!rec.edit_allowed && rec.approval_status !== 'rejected') {
                return res.status(409).json({
                    error: `Result already submitted for this student/subject/exam in this period. Wait for admin approval or ask admin to unlock for re-edit.`,
                    locked: true
                });
            }
        }

        // Validate the exam exists (admin-defined exams are supported)
        let maxScore = 100;
        try {
            const { rows: examRows } = await query(
                `SELECT max_score FROM exams WHERE exam_key = $1 AND deleted_at IS NULL LIMIT 1`,
                [examType]
            );
            if (examRows[0]) {
                maxScore = parseFloat(examRows[0].max_score);
            } else if (EXAM_TYPES[examType]) {
                maxScore = EXAM_TYPES[examType].maxScore;
            }
        } catch (e) { /* fall back to default */ }
        const parsedScore = Math.min(parseFloat(score) || 0, maxScore);

        // Safe upsert respecting uq_results_student_subject_part_period partial unique index
        const { rows: upsertRows } = await query(
            `INSERT INTO results (student_id, subject, score, exam_type, max_score, approval_status, submitted_by, submitted_at, edit_allowed, period_id, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW(), false, $7, NOW())
             ON CONFLICT (student_id, lower(subject), exam_type, COALESCE(period_id, 0))
             WHERE deleted_at IS NULL
             DO UPDATE SET
                 score = EXCLUDED.score,
                 max_score = EXCLUDED.max_score,
                 approval_status = 'pending',
                 submitted_by = EXCLUDED.submitted_by,
                 submitted_at = NOW(),
                 edit_allowed = false,
                 updated_at = NOW()
             RETURNING id, score`,
            [studentId, subject, parsedScore, examType, maxScore, teacherName || `Teacher-${teacherId}`, targetPeriodId]
        );

        if (existing[0] && existing[0].score !== parsedScore) {
            await query(`
                INSERT INTO result_audit_log (result_id, student_id, subject, exam_type, period_id, old_score, new_score, old_status, new_status, action, actor, reason)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 'UPDATE', $9, 'Teacher corrected score upon resubmission')
            `, [upsertRows[0]?.id || existing[0].id, studentId, subject, examType, targetPeriodId, existing[0].score, parsedScore, existing[0].approval_status, teacherName || `Teacher-${teacherId}`]).catch(() => {});
        }

        res.status(201).json({ message: 'Result submitted for approval.', periodId: targetPeriodId });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST submit multiple results in one transaction (fast, single connection)
// RULE: Blocks any exam+subject already submitted and locked (not edit_allowed)
router.post('/batch', async (req, res) => {
    const { records, attendanceRecords, teacherId, teacherName, periodId } = req.body;
    const hasRecords = Array.isArray(records) && records.length > 0;
    const hasAtt = Array.isArray(attendanceRecords) && attendanceRecords.length > 0;
    if (!hasRecords && !hasAtt) {
        return res.status(400).json({ error: 'records or attendanceRecords array is required.' });
    }
    const tName = teacherName || `Teacher-${teacherId}`;
    let client = null;
    try {
        let defaultPeriodId = periodId ? parseInt(periodId) : null;
        if (!defaultPeriodId) {
            try {
                const { rows: actP } = await query(`SELECT id FROM exam_periods WHERE is_active = true AND deleted_at IS NULL ORDER BY year DESC, month DESC LIMIT 1`);
                if (actP[0]) defaultPeriodId = actP[0].id;
            } catch(e) {}
        }

        // Global check: Is the exam period locked or closed by admin?
        if (defaultPeriodId) {
            const { rows: examLock } = await query(
                `SELECT ep.name, ep.status, COALESCE(ep.is_locked, false) AS exam_locked
                 FROM exam_periods ep WHERE ep.id = $1 AND ep.deleted_at IS NULL LIMIT 1`,
                [defaultPeriodId]
            );
            if (examLock[0] && (examLock[0].exam_locked || examLock[0].status === 'locked' || examLock[0].status === 'closed')) {
                return res.status(403).json({
                    error: `The exam "${examLock[0].name}" is currently ${examLock[0].status || 'locked'} by the administrator. Scores cannot be submitted or changed.`,
                    locked: true,
                    examId: defaultPeriodId
                });
            }
        }

        // Pre-check: Ensure any existing results for this batch are unlocked (or rejected) before proceeding
        // Deduplicate incoming records by studentId + examType + subject to prevent duplicate items within payload
        const seenPayloadKeys = new Set();
        const validRecords = [];
        for (const rec of (records || [])) {
            const { studentId, subject, examType } = rec;
            if (!studentId || !subject || !examType) continue;
            // Ignore blank or unentered scores in partial submissions
            if (rec.score === '' || rec.score === null || rec.score === undefined) continue;

            const recPeriodId = rec.periodId ? parseInt(rec.periodId) : (rec.period_id ? parseInt(rec.period_id) : defaultPeriodId);
            const pKey = `${studentId}_${String(subject).toLowerCase()}_${String(examType).toLowerCase()}_${recPeriodId || 0}`;
            if (seenPayloadKeys.has(pKey)) continue; // ignore duplicate payload rows
            seenPayloadKeys.add(pKey);

            // Verify result-level lock
            const { rows: existing } = await query(
                `SELECT id, approval_status, edit_allowed FROM results
                 WHERE student_id = $1 AND lower(subject) = lower($2) AND exam_type = $3
                   AND ($4::INTEGER IS NULL OR period_id = $4) AND deleted_at IS NULL
                 ORDER BY id DESC LIMIT 1`,
                [studentId, subject, examType, recPeriodId]
            );
            if (existing[0] && !existing[0].edit_allowed && existing[0].approval_status !== 'rejected') {
                return res.status(409).json({
                    error: `Results for "${subject}" (${examType}) were already submitted and locked for this period. Ask the admin to unlock for re-editing.`,
                    locked: true,
                    subject,
                    examType
                });
            }

            validRecords.push(rec);
        }

        client = await pool.connect();
        await client.query('BEGIN');

        for (const rec of validRecords) {
            const { studentId, subject, examType, score, remarks } = rec;
            const recPeriodId = rec.periodId ? parseInt(rec.periodId) : (rec.period_id ? parseInt(rec.period_id) : defaultPeriodId);

            // Lookup component in exam_components for this exam
            let maxScore = 100;
            let componentId = rec.componentId || rec.component_id ? parseInt(rec.componentId || rec.component_id) : null;
            let componentName = examType;

            if (recPeriodId) {
                let compSql = `
                    SELECT id, name, max_marks FROM exam_components 
                    WHERE exam_id = $1 AND deleted_at IS NULL AND (
                        ($2::int IS NOT NULL AND id = $2) OR
                        component_key = $3 OR 
                        LOWER(name) = LOWER($3)
                `;
                const compNumMatch = String(examType).match(/^comp_?(\d+)$/i);
                if (compNumMatch) {
                    compSql += ` OR order_num = ${parseInt(compNumMatch[1])}`;
                }
                compSql += `) ORDER BY id ASC LIMIT 1`;

                const { rows: compRows } = await client.query(compSql, [recPeriodId, componentId, String(examType)]);
                if (compRows[0]) {
                    maxScore = parseFloat(compRows[0].max_marks);
                    componentId = compRows[0].id;
                    componentName = compRows[0].name;
                }
            }

            if (componentId === null) {
                const { rows: examRows } = await client.query(
                    `SELECT id, max_score, name FROM exams WHERE exam_key = $1 AND deleted_at IS NULL LIMIT 1`,
                    [examType]
                );
                const def = EXAM_TYPES[examType];
                maxScore = examRows[0] ? parseFloat(examRows[0].max_score) : (def ? def.maxScore : 100);
                if (examRows[0]) componentName = examRows[0].name;
            }

            const rawScore = parseFloat(score) || 0;
            if (rawScore > maxScore) {
                throw new Error(`Score ${rawScore} exceeds maximum allowed limit (${maxScore}) for component "${componentName}".`);
            }
            const parsedScore = Math.max(0, Math.min(rawScore, maxScore));

            // Fetch previous record for audit log if updating
            const { rows: prevRec } = await client.query(
                `SELECT id, score, approval_status FROM results
                 WHERE student_id = $1 AND lower(subject) = lower($2) AND exam_type = $3
                   AND ($4::INTEGER IS NULL OR period_id = $4) AND deleted_at IS NULL LIMIT 1`,
                [studentId, subject, examType, recPeriodId]
            );

            // Safe upsert on (student_id, lower(subject), exam_type, COALESCE(period_id, 0)) WHERE deleted_at IS NULL
            const { rows: upserted } = await client.query(`
                INSERT INTO results (
                    student_id, subject, score, exam_type, max_score, remarks,
                    approval_status, submitted_by, submitted_at, edit_allowed,
                    period_id, component_id, component_name, attendance_status, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NOW(), false, $8, $9, $10, 'attended', NOW())
                ON CONFLICT (student_id, lower(subject), exam_type, COALESCE(period_id, 0))
                WHERE deleted_at IS NULL
                DO UPDATE SET
                    score = EXCLUDED.score,
                    max_score = EXCLUDED.max_score,
                    remarks = COALESCE(EXCLUDED.remarks, results.remarks),
                    approval_status = 'pending',
                    submitted_by = EXCLUDED.submitted_by,
                    submitted_at = NOW(),
                    edit_allowed = false,
                    component_id = COALESCE(EXCLUDED.component_id, results.component_id),
                    component_name = COALESCE(EXCLUDED.component_name, results.component_name),
                    attendance_status = 'attended',
                    updated_at = NOW()
                RETURNING id, score
            `, [studentId, subject, parsedScore, examType, maxScore, remarks || null, tName, recPeriodId, componentId, componentName]);

            // Audit log mark correction if score changed
            if (prevRec[0] && prevRec[0].score !== parsedScore) {
                await client.query(`
                    INSERT INTO result_audit_log (result_id, student_id, subject, exam_type, period_id, old_score, new_score, old_status, new_status, action, actor, reason)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', 'UPDATE', $9, 'Score updated on teacher resubmission')
                `, [upserted[0]?.id || prevRec[0].id, studentId, subject, examType, recPeriodId, prevRec[0].score, parsedScore, prevRec[0].approval_status, tName]);
            } else if (!prevRec[0]) {
                await client.query(`
                    INSERT INTO result_audit_log (result_id, student_id, subject, exam_type, period_id, old_score, new_score, old_status, new_status, action, actor, reason)
                    VALUES ($1, $2, $3, $4, $5, NULL, $6, NULL, 'pending', 'INSERT', $7, 'Initial partial/full result submission')
                `, [upserted[0]?.id, studentId, subject, examType, recPeriodId, parsedScore, tName]);
            }

            // Synchronize exam_attendance as 'attended'
            await client.query(`
                INSERT INTO exam_attendance (student_id, academic_year, class_id, period_id, subject, status, notes, recorded_by, updated_at)
                SELECT $1, '2026', s.classid, $2, $3, 'attended', 'Result submitted', $4, NOW()
                FROM students s WHERE s.id = $1
                ON CONFLICT (student_id, COALESCE(period_id, 0), LOWER(subject), COALESCE(class_id, 0))
                DO UPDATE SET status = 'attended', updated_at = NOW()
            `, [studentId, recPeriodId, subject, tName]);
        }

        // Process non-attending student records if provided
        const attendanceRecords = req.body.attendanceRecords;
        if (Array.isArray(attendanceRecords) && attendanceRecords.length > 0) {
            for (const att of attendanceRecords) {
                const { studentId, subject, status, notes, periodId: attPid } = att;
                if (!studentId || !subject) continue;
                const pid = attPid ? parseInt(attPid) : defaultPeriodId;
                const attStatus = status || 'did_not_attend';
                await client.query(`
                    INSERT INTO exam_attendance (student_id, academic_year, class_id, period_id, subject, status, notes, recorded_by, updated_at)
                    SELECT $1, '2026', s.classid, $2, $3, $4, $5, $6, NOW()
                    FROM students s WHERE s.id = $1
                    ON CONFLICT (student_id, COALESCE(period_id, 0), LOWER(subject), COALESCE(class_id, 0))
                    DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = NOW()
                `, [studentId, pid, subject, attStatus, notes || 'Recorded during roster submission', tName]);

                if (attStatus !== 'attended') {
                    await client.query(`
                        UPDATE results SET deleted_at = NOW()
                        WHERE student_id = $1 AND LOWER(subject) = LOWER($2) AND ($3::INTEGER IS NULL OR period_id = $3) AND deleted_at IS NULL
                    `, [studentId, subject, pid]);
                }
            }
        }

        // Update draft status to submitted if exists
        if (defaultPeriodId) {
            await client.query(`
                UPDATE result_drafts
                SET status = 'submitted', updated_at = NOW()
                WHERE teacher_id = $1 AND period_id = $2
            `, [teacherId || 0, defaultPeriodId]).catch(() => {});
        }

        await client.query('COMMIT');
        const countResults = validRecords.length;
        const countAtt = (attendanceRecords || []).length;
        res.status(201).json({ message: `${countResults} result(s) and ${countAtt} attendance record(s) submitted for approval.` });
    } catch (err) {
        if (client) { try { await client.query('ROLLBACK'); } catch (e) {} }
        res.status(400).json({ error: err.message });
    } finally {
        if (client) client.release();
    }
});

// PUT approve/reject results (admin)
router.put('/approve', async (req, res) => {
    const { ids, status } = req.body;
    if (!ids || !Array.isArray(ids) || !status) {
        return res.status(400).json({ error: 'ids array and status are required.' });
    }
    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Status must be approved or rejected.' });
    }
    try {
        for (const id of ids) {
            // When approving: lock it (edit_allowed=false). When rejecting: allow teacher to re-submit.
            const editAllowed = status === 'rejected';
            await query(
                `UPDATE results SET approval_status = $1, edit_allowed = $2 WHERE id = $3`,
                [status, editAllowed, id]
            );
        }

        // If approved, update student GPA and fix attendance for any student whose marks were
        // recorded by admin (they may have been marked 'did_not_attend' but admin entered scores)
        if (status === 'approved') {
            for (const id of ids) {
                const { rows } = await query(
                    `SELECT student_id, subject, period_id FROM results WHERE id = $1`,
                    [id]
                );
                if (rows[0]) {
                    const { student_id, subject, period_id } = rows[0];
                    await updateStudentGPA(student_id);
                    // If this student was marked did_not_attend but now has approved results,
                    // update attendance to 'attended' so teacher dashboard shows correctly
                    if (subject && period_id) {
                        await query(
                            `UPDATE exam_attendance
                             SET status = 'attended', notes = 'Attendance updated — result approved by Admin', updated_at = NOW()
                             WHERE student_id = $1
                               AND period_id = $2
                               AND LOWER(subject) = LOWER($3)
                               AND status IN ('did_not_attend', 'absent')`,
                            [student_id, period_id, subject]
                        ).catch(() => {});
                    }
                }
            }
        }

        res.json({ message: `${ids.length} result(s) ${status}.` });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT unlock results for teacher re-edit (admin only)
// Sets edit_allowed = true so teacher can resubmit
router.put('/unlock', async (req, res) => {
    const { ids, unlock, reason, changedBy } = req.body; // unlock: true = allow edit, false = lock
    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: 'ids array is required.' });
    }
    const allow = unlock !== false; // default true
    const actor = changedBy || 'Administrator';
    const logReason = reason || (allow ? 'Authorized for correction/missing marks entry' : 'Admin locked results');
    try {
        for (const id of ids) {
            const { rows: rRow } = await query(
                `SELECT student_id, subject, exam_type, period_id, score, approval_status, edit_allowed FROM results WHERE id = $1`,
                [id]
            );
            await query(
                `UPDATE results SET edit_allowed = $1, approval_status = 'pending', updated_at = NOW() WHERE id = $2`,
                [allow, id]
            );
            if (rRow[0]) {
                await query(`
                    INSERT INTO result_audit_log (result_id, student_id, subject, exam_type, period_id, old_score, new_score, old_status, new_status, action, actor, reason)
                    VALUES ($1, $2, $3, $4, $5, $6, $6, $7, 'pending', $8, $9, $10)
                `, [id, rRow[0].student_id, rRow[0].subject, rRow[0].exam_type, rRow[0].period_id, rRow[0].score, rRow[0].approval_status, allow ? 'UNLOCK' : 'LOCK', actor, logReason]).catch(() => {});
            }
        }
        res.json({ message: `${ids.length} result(s) ${allow ? 'unlocked for re-edit' : 're-locked'}.` });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT admin directly corrects / updates scores for a student+subject
router.put('/admin/direct-update', async (req, res) => {
    const { studentId, subject, scores, approvalStatus, periodId } = req.body;
    if (!studentId || !subject || !scores || typeof scores !== 'object') {
        return res.status(400).json({ error: 'studentId, subject, and scores object are required.' });
    }
    try {
        const targetPeriodId = periodId ? parseInt(periodId) : null;
        for (const [examType, scoreVal] of Object.entries(scores)) {
            const score = parseFloat(scoreVal);
            if (isNaN(score)) continue;
            const maxScore = await getExamMaxScore(examType);
            const status = approvalStatus || 'approved';
            
            const { rows: existing } = await query(
                `SELECT id FROM results WHERE student_id = $1 AND subject = $2 AND exam_type = $3 AND ($4::INTEGER IS NULL OR period_id = $4) AND deleted_at IS NULL`,
                [studentId, subject, examType, targetPeriodId]
            );
            if (existing.length > 0) {
                await query(
                    `UPDATE results SET score = $1, max_score = $2, approval_status = $3, edit_allowed = false, period_id = COALESCE($4, period_id) WHERE id = $5`,
                    [score, maxScore, status, targetPeriodId, existing[0].id]
                );
            } else {
                await query(
                    `INSERT INTO results (student_id, subject, exam_type, score, max_score, approval_status, submitted_by, edit_allowed, period_id)
                     VALUES ($1, $2, $3, $4, $5, $6, 'Admin', false, $7)`,
                    [studentId, subject, examType, score, maxScore, status, targetPeriodId]
                );
            }
        }
        await updateStudentGPA(studentId);

        // Fix attendance: if admin entered scores for a previously absent student, mark them attended
        if (targetPeriodId) {
            await query(
                `UPDATE exam_attendance
                 SET status = 'attended', notes = 'Attendance updated — result entered by Admin', updated_at = NOW()
                 WHERE student_id = $1
                   AND period_id = $2
                   AND LOWER(subject) = LOWER($3)
                   AND status IN ('did_not_attend', 'absent')`,
                [studentId, targetPeriodId, subject]
            ).catch(() => {});
        }

        res.json({ message: 'Result updated successfully by admin.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT hold results (admin) — sets approval_status to 'on_hold' with optional release time
router.put('/hold', async (req, res) => {
    const { ids, releaseAt } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids array is required.' });
    }
    try {
        for (const id of ids) {
            if (releaseAt) {
                await query(
                    `UPDATE results SET approval_status = 'on_hold', release_at = $1 WHERE id = $2`,
                    [releaseAt, id]
                );
            } else {
                await query(
                    `UPDATE results SET approval_status = 'on_hold', release_at = NULL WHERE id = $1`,
                    [id]
                );
            }
        }
        res.json({ message: `${ids.length} result(s) put on hold.` });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT release results immediately (admin)
router.put('/release', async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids array is required.' });
    }
    try {
        for (const id of ids) {
            await query(
                `UPDATE results SET approval_status = 'approved', release_at = NULL WHERE id = $1`,
                [id]
            );
        }
        // Update GPA for affected students
        const studentIds = new Set();
        for (const id of ids) {
            const { rows } = await query(`SELECT student_id FROM results WHERE id = $1`, [id]);
            if (rows[0]) studentIds.add(rows[0].student_id);
        }
        for (const sid of studentIds) {
            await updateStudentGPA(sid);
        }
        res.json({ message: `${ids.length} result(s) released.` });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE a result (soft-delete)
router.delete('/:id', async (req, res) => {
    try {
        await query(`UPDATE results SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Helper: Update student GPA based on approved results
async function updateStudentGPA(studentId) {
    try {
        const { rows } = await query(
            `SELECT score FROM results WHERE student_id = $1 AND approval_status = 'approved'`,
            [studentId]
        );
        if (rows.length === 0) return;

        // Calculate total score across all subjects
        const totalScore = rows.reduce((sum, r) => sum + parseFloat(r.score), 0);
        const maxPossible = rows.length * 100; // Each subject max is 100
        const percentage = (totalScore / maxPossible) * 100;

        let gpa;
        if (percentage >= 90) gpa = 4.0;
        else if (percentage >= 85) gpa = 3.7;
        else if (percentage >= 80) gpa = 3.3;
        else if (percentage >= 75) gpa = 3.0;
        else if (percentage >= 70) gpa = 2.7;
        else if (percentage >= 65) gpa = 2.3;
        else if (percentage >= 60) gpa = 2.0;
        else if (percentage >= 50) gpa = 1.0;
        else gpa = 0.0;

        await query(`UPDATE students SET gpa = $1 WHERE id = $2`, [gpa, studentId]);
    } catch (e) { }
}

// --- CSV Template Download ---
router.get('/template/download', (req, res) => {
    const csv = stringify([
        ['StudentID', 'Subject', 'Q1', 'Q2', 'S1', 'S2', 'Midterm', 'Final'],
        ['ELP250001', 'Mathematics', '4', '5', '4', '5', '35', '38'],
        ['ELP250002', 'Mathematics', '3', '4', '3', '4', '30', '32']
    ]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="results-template.csv"');
    res.send(csv);
});

// --- CSV Upload for Bulk Results ---
router.post('/upload-csv', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'CSV file is required.' });
    try {
        const content = req.file.buffer.toString('utf-8');
        const records = parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true });

        let imported = 0, errors = [];
        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rk = Object.keys(row).reduce((acc, k) => { acc[k.toLowerCase().replace(/\(.*\)/g,'').trim()] = row[k]; return acc; }, {});

            const studentIdRaw = (rk['studentid'] || '').toString().replace(/^(BB|ELP)/i, '').trim();
            const rawNum = parseInt(studentIdRaw);
            const studentId = rawNum >= 260000 ? rawNum - 260000 : (rawNum >= 250000 ? rawNum - 250000 : rawNum);
            const subject = (rk['subject'] || '').trim();
            if (!studentId || isNaN(studentId) || !subject) { errors.push(`Row ${i+2}: Invalid StudentID or Subject`); continue; }

            const examMap = {
                'q1': 'quiz1', 'q2': 'quiz2', 's1': 'sem1', 's2': 'sem2',
                'midterm': 'midterm', 'final': 'final'
            };
            const scores = [];
            for (const [col, type] of Object.entries(examMap)) {
                const val = parseFloat(rk[col]);
                const maxScore = EXAM_TYPES[type]?.maxScore || 100;
                if (!isNaN(val)) scores.push({ examType: type, score: Math.min(val, maxScore) });
            }
            if (scores.length === 0) { errors.push(`Row ${i+2}: No valid scores for ${subject}`); continue; }

            try {
                await query(
                    `DELETE FROM results WHERE student_id = $1 AND subject = $2 AND approval_status = 'pending'`,
                    [studentId, subject]
                );
                for (const s of scores) {
                    await query(
                        `INSERT INTO results (student_id, subject, score, exam_type, max_score, approval_status, submitted_by, submitted_at)
                         VALUES ($1, $2, $3, $4, $5, 'pending', 'csv-import', NOW())`,
                        [studentId, subject, s.score, s.examType, EXAM_TYPES[s.examType]?.maxScore || 100]
                    );
                }
                imported++;
            } catch (e) {
                errors.push(`Row ${i+2}: ${e.message}`);
            }
        }

        res.json({ message: `Imported ${imported} result(s).`, errors: errors.length > 0 ? errors : undefined });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- DRAFT RESULTS MANAGEMENT ---

// POST save draft (auto-save or manual save)
router.post('/draft/save', async (req, res) => {
    const { teacherId, teacherName, periodId, classId, subject, draftData, attendanceData } = req.body;
    if (!teacherId || !periodId || !subject) {
        return res.status(400).json({ error: 'teacherId, periodId, and subject are required.' });
    }
    try {
        await query(`
            INSERT INTO result_drafts (
                teacher_id, teacher_name, period_id, class_id, subject,
                draft_data, attendance_data, status, last_saved_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'draft', NOW(), NOW())
            ON CONFLICT (teacher_id, period_id, class_id, subject)
            DO UPDATE SET
                teacher_name = EXCLUDED.teacher_name,
                draft_data = EXCLUDED.draft_data,
                attendance_data = EXCLUDED.attendance_data,
                status = 'draft',
                last_saved_at = NOW(),
                updated_at = NOW()
        `, [
            teacherId,
            teacherName || 'Teacher',
            parseInt(periodId),
            classId ? parseInt(classId) : null,
            subject.trim(),
            JSON.stringify(draftData || []),
            JSON.stringify(attendanceData || [])
        ]);
        res.json({ message: 'Draft saved successfully.', savedAt: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET load saved draft
router.get('/draft/load', async (req, res) => {
    const { teacherId, periodId, classId, subject } = req.query;
    if (!teacherId || !periodId || !subject) {
        return res.status(400).json({ error: 'teacherId, periodId, and subject are required.' });
    }
    try {
        const { rows } = await query(`
            SELECT id, draft_data, attendance_data, status, last_saved_at, updated_at
            FROM result_drafts
            WHERE teacher_id = $1
              AND period_id = $2
              AND ($3::INTEGER IS NULL OR class_id = $3)
              AND LOWER(subject) = LOWER($4)
            ORDER BY last_saved_at DESC
            LIMIT 1
        `, [
            parseInt(teacherId),
            parseInt(periodId),
            classId ? parseInt(classId) : null,
            subject.trim()
        ]);
        if (!rows[0]) return res.json({ found: false });
        res.json({ found: true, ...rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET list all drafts for a teacher
router.get('/draft/list', async (req, res) => {
    const { teacherId } = req.query;
    if (!teacherId) return res.status(400).json({ error: 'teacherId is required.' });
    try {
        const { rows } = await query(`
            SELECT rd.id, rd.period_id, rd.class_id, rd.subject, rd.status,
                   rd.last_saved_at, rd.updated_at,
                   ep.name AS period_name,
                   c.name AS class_name,
                   jsonb_array_length(COALESCE(rd.draft_data, '[]'::jsonb)) AS students_with_marks,
                   COALESCE((
                       SELECT COUNT(DISTINCT s.id)
                       FROM students s
                       WHERE (s.classid = rd.class_id OR s.id IN (SELECT student_id FROM class_students cs WHERE cs.class_id = rd.class_id AND cs.deleted_at IS NULL))
                         AND s.deleted_at IS NULL
                   ), 0)::int AS total_students
            FROM result_drafts rd
            LEFT JOIN exam_periods ep ON ep.id = rd.period_id
            LEFT JOIN classes c ON c.id = rd.class_id
            WHERE rd.teacher_id = $1
            ORDER BY rd.last_saved_at DESC
        `, [parseInt(teacherId)]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE a draft
router.delete('/draft/:id', async (req, res) => {
    try {
        await query(`DELETE FROM result_drafts WHERE id = $1`, [parseInt(req.params.id)]);
        res.json({ message: 'Draft deleted.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET missing students for exam period and class
router.get('/missing-students', async (req, res) => {
    const { periodId, classId, subject } = req.query;
    if (!periodId || !classId) {
        return res.status(400).json({ error: 'periodId and classId are required.' });
    }
    try {
        const pId = parseInt(periodId);
        const cId = parseInt(classId);

        // Fetch all students belonging to the class
        const { rows: students } = await query(`
            SELECT s.id, s.name, s.grade, s.image,
                   ('BB' || LPAD((260000 + s.id)::TEXT, 6, '0')) AS bb_id
            FROM students s
            WHERE (s.classid = $1 OR s.id IN (SELECT cs.student_id FROM class_students cs WHERE cs.class_id = $1 AND cs.deleted_at IS NULL))
              AND s.deleted_at IS NULL
            ORDER BY s.id ASC
        `, [cId]);

        // Fetch counts of results per student for this period & subject
        const { rows: resultCounts } = await query(`
            SELECT student_id,
                   COUNT(id) AS component_count,
                   MAX(approval_status) AS approval_status,
                   BOOL_AND(edit_allowed) AS edit_allowed
            FROM results
            WHERE period_id = $1
              AND ($2::TEXT IS NULL OR LOWER(subject) = LOWER($2))
              AND deleted_at IS NULL
            GROUP BY student_id
        `, [pId, subject ? subject.trim() : null]);

        // Fetch attendance status
        const { rows: attList } = await query(`
            SELECT student_id, status FROM exam_attendance
            WHERE period_id = $1
              AND ($2::TEXT IS NULL OR LOWER(subject) = LOWER($2))
        `, [pId, subject ? subject.trim() : null]);

        const resultMap = new Map(resultCounts.map(r => [r.student_id, r]));
        const attMap = new Map(attList.map(a => [a.student_id, a.status]));

        const completed = [];
        const missing = [];
        const absent = [];

        students.forEach(s => {
            const resData = resultMap.get(s.id);
            const attStatus = attMap.get(s.id);

            if (attStatus && attStatus !== 'attended') {
                absent.push({ ...s, attendance_status: attStatus });
            } else if (resData && parseInt(resData.component_count) > 0) {
                completed.push({
                    ...s,
                    component_count: parseInt(resData.component_count),
                    approval_status: resData.approval_status,
                    edit_allowed: resData.edit_allowed
                });
            } else {
                missing.push(s);
            }
        });

        res.json({
            totalExpected: students.length,
            submittedCount: completed.length,
            missingCount: missing.length,
            absentCount: absent.length,
            completionPercentage: students.length > 0 ? Math.round((completed.length / students.length) * 100) : 0,
            missingStudents: missing,
            completedStudents: completed,
            absentStudents: absent
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET audit logs for result changes
router.get('/audit-logs', async (req, res) => {
    const { periodId, studentId, limit } = req.query;
    try {
        let sql = `
            SELECT ral.*, s.name as student_name
            FROM result_audit_log ral
            LEFT JOIN students s ON s.id = ral.student_id
            WHERE 1=1
        `;
        const params = [];
        if (periodId) {
            params.push(parseInt(periodId));
            sql += ` AND ral.period_id = $${params.length}`;
        }
        if (studentId) {
            params.push(parseInt(studentId));
            sql += ` AND ral.student_id = $${params.length}`;
        }
        sql += ` ORDER BY ral.created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit) || 50);

        const { rows } = await query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
