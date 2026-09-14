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

// GET results for a class and subject (to populate existing scores & lock status for teacher)
router.get('/class/:classId/subject/:subject', async (req, res) => {
    const { classId, subject } = req.params;
    try {
        const { rows } = await query(`
            SELECT r.id, r.student_id, r.subject, r.score, r.exam_type, r.max_score, r.remarks,
                   r.approval_status, r.edit_allowed, r.submitted_at
            FROM results r
            JOIN students s ON r.student_id = s.id
            WHERE (s.classid = $1 OR s.id IN (SELECT student_id FROM class_students WHERE class_id = $1))
              AND LOWER(r.subject) = LOWER($2)
              AND r.deleted_at IS NULL
            ORDER BY r.student_id ASC, r.id ASC
        `, [classId, subject]);
        res.json(rows);
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
                    `SELECT subject, score, exam_type FROM results WHERE student_id = $1 AND approval_status = 'approved' AND exam_type = $2`,
                    [studentId, examType]
                )
                : await query(
                    `SELECT subject, score, exam_type FROM results WHERE student_id = $1 AND approval_status = 'approved'`,
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

// GET all results (admin view - all statuses)
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT r.id, r.student_id, r.subject, r.score, r.exam_type, r.approval_status, r.submitted_by, r.submitted_at, r.edit_allowed,
                   s.name AS "studentName", s.grade
            FROM results r
            JOIN students s ON r.student_id = s.id
            WHERE r.deleted_at IS NULL
            ORDER BY r.submitted_at DESC, r.student_id
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET pending results (admin view)
router.get('/pending/all', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT r.id, r.student_id, r.subject, r.score, r.exam_type, r.approval_status, r.submitted_by, r.submitted_at, r.edit_allowed,
                   s.name AS "studentName", s.grade
            FROM results r
            JOIN students s ON r.student_id = s.id
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
                   s.name AS "studentName", s.grade
            FROM results r
            JOIN students s ON r.student_id = s.id
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
    const { studentId, subject, examType, score, teacherId, teacherName } = req.body;
    if (!studentId || !subject) {
        return res.status(400).json({ error: 'studentId and subject are required.' });
    }
    if (!examType) {
        return res.status(400).json({ error: 'Please select an exam (examType) to record a result for.' });
    }
    try {
        // Check if a result already exists for this student/subject/exam and is locked
        const { rows: existing } = await query(
            `SELECT id, approval_status, edit_allowed FROM results
             WHERE student_id = $1 AND subject = $2 AND exam_type = $3
               AND submitted_by = $4 AND deleted_at IS NULL
             ORDER BY id DESC LIMIT 1`,
            [studentId, subject, examType, teacherName || `Teacher-${teacherId}`]
        );
        if (existing[0]) {
            const rec = existing[0];
            // If approved/pending and not unlocked → block
            if (!rec.edit_allowed && rec.approval_status !== 'rejected') {
                return res.status(409).json({
                    error: `Result already submitted for this student/subject/exam. Wait for admin approval or ask admin to unlock for re-edit.`,
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

        // Delete any existing result so we can re-insert (only gets here if unlocked or rejected)
        await query(
            `DELETE FROM results WHERE student_id = $1 AND subject = $2 AND exam_type = $3 AND submitted_by = $4`,
            [studentId, subject, examType, teacherName || `Teacher-${teacherId}`]
        );

        // Insert new result with pending status, lock it (edit_allowed = false)
        await query(
            `INSERT INTO results (student_id, subject, score, exam_type, max_score, approval_status, submitted_by, submitted_at, edit_allowed)
             VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW(), false)`,
            [studentId, subject, parsedScore, examType, maxScore, teacherName || `Teacher-${teacherId}`]
        );
        res.status(201).json({ message: 'Result submitted for approval.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST submit multiple results in one transaction (fast, single connection)
// RULE: Blocks any exam+subject already submitted and locked (not edit_allowed)
router.post('/batch', async (req, res) => {
    const { records, teacherId, teacherName } = req.body;
    if (!records || !Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: 'records array is required.' });
    }
    const tName = teacherName || `Teacher-${teacherId}`;
    let client = null;
    try {
        // Pre-check for locked exams or already submitted locked results before opening transaction
        for (const rec of records) {
            const { studentId, subject, examType } = rec;
            if (!studentId || !subject || !examType) continue;

            // 1. Check if the exam itself is locked globally by admin
            const { rows: examLock } = await query(
                `SELECT e.name, COALESCE(e.is_locked, false) AS exam_locked
                 FROM exams e WHERE e.exam_key = $1 AND e.deleted_at IS NULL LIMIT 1`,
                [examType]
            );
            if (examLock[0] && examLock[0].exam_locked) {
                return res.status(403).json({
                    error: `The exam "${examLock[0].name}" is currently locked by the administrator. Scores cannot be submitted or changed.`,
                    locked: true,
                    examType
                });
            }

            // 2. Check if previous submission is locked
            const { rows: existing } = await query(
                `SELECT id, approval_status, edit_allowed FROM results
                 WHERE student_id = $1 AND subject = $2 AND exam_type = $3
                   AND submitted_by = $4 AND deleted_at IS NULL
                 ORDER BY id DESC LIMIT 1`,
                [studentId, subject, examType, tName]
            );
            if (existing[0] && !existing[0].edit_allowed && existing[0].approval_status !== 'rejected') {
                return res.status(409).json({
                    error: `Results for "${subject}" (${examType}) were already submitted and locked. Ask the admin to unlock for re-editing.`,
                    locked: true,
                    subject,
                    examType
                });
            }
        }

        client = await pool.connect();
        await client.query('BEGIN');
        for (const rec of records) {
            const { studentId, subject, examType, score, remarks } = rec;
            if (!studentId || !subject || !examType) {
                throw new Error('studentId, subject and examType are required for every record.');
            }
            const { rows: examRows } = await client.query(
                `SELECT id, max_score FROM exams WHERE exam_key = $1 AND deleted_at IS NULL LIMIT 1`,
                [examType]
            );
            const def = EXAM_TYPES[examType];
            const maxScore = examRows[0] ? parseFloat(examRows[0].max_score) : (def ? def.maxScore : 100);
            const parsedScore = Math.min(parseFloat(score) || 0, maxScore);

            // Delete existing (only reachable if unlocked or rejected, due to pre-check above)
            await client.query(
                `DELETE FROM results WHERE student_id = $1 AND subject = $2 AND exam_type = $3 AND submitted_by = $4`,
                [studentId, subject, examType, tName]
            );
            await client.query(
                `INSERT INTO results (student_id, subject, score, exam_type, max_score, remarks, approval_status, submitted_by, submitted_at, edit_allowed)
                 VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NOW(), false)`,
                [studentId, subject, parsedScore, examType, maxScore, remarks || null, tName]
            );
        }
        await client.query('COMMIT');
        res.status(201).json({ message: `${records.length} result(s) submitted for approval.` });
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

        // If approved, update student GPA
        if (status === 'approved') {
            for (const id of ids) {
                const { rows } = await query(`SELECT student_id FROM results WHERE id = $1`, [id]);
                if (rows[0]) {
                    await updateStudentGPA(rows[0].student_id);
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
    const { ids, unlock } = req.body; // unlock: true = allow edit, false = lock
    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: 'ids array is required.' });
    }
    const allow = unlock !== false; // default true
    try {
        for (const id of ids) {
            await query(
                `UPDATE results SET edit_allowed = $1, approval_status = 'pending' WHERE id = $2`,
                [allow, id]
            );
        }
        res.json({ message: `${ids.length} result(s) ${allow ? 'unlocked for re-edit' : 're-locked'}.` });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT admin directly corrects / updates scores for a student+subject
router.put('/admin/direct-update', async (req, res) => {
    const { studentId, subject, scores, approvalStatus } = req.body;
    if (!studentId || !subject || !scores || typeof scores !== 'object') {
        return res.status(400).json({ error: 'studentId, subject, and scores object are required.' });
    }
    try {
        for (const [examType, scoreVal] of Object.entries(scores)) {
            const score = parseFloat(scoreVal);
            if (isNaN(score)) continue;
            const maxScore = await getExamMaxScore(examType);
            const status = approvalStatus || 'approved';
            
            const { rows: existing } = await query(
                `SELECT id FROM results WHERE student_id = $1 AND subject = $2 AND exam_type = $3 AND deleted_at IS NULL`,
                [studentId, subject, examType]
            );
            if (existing.length > 0) {
                await query(
                    `UPDATE results SET score = $1, max_score = $2, approval_status = $3, edit_allowed = false WHERE id = $4`,
                    [score, maxScore, status, existing[0].id]
                );
            } else {
                await query(
                    `INSERT INTO results (student_id, subject, exam_type, score, max_score, approval_status, submitted_by, edit_allowed)
                     VALUES ($1, $2, $3, $4, $5, $6, 'Admin', false)`,
                    [studentId, subject, examType, score, maxScore, status]
                );
            }
        }
        await updateStudentGPA(studentId);
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
        else if (percentage >= 80) gpa = 3.0;
        else if (percentage >= 70) gpa = 2.0;
        else if (percentage >= 60) gpa = 1.0;
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

module.exports = router;
