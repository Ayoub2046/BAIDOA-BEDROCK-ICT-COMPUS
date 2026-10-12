// Backend/routes/exams.js
// Comprehensive Exam Management:
// - Independent monthly exams, midterms, term exams, final exams
// - 3 or 4 configurable assessment components (strictly summing to 100)
// - Exam lifecycle: Draft, Open, Closed, Locked, with Admin Reopening and Audit Logs
// - Teacher submission tracking & Aggregate / Final result configuration
// - 100% Backwards-compatible with historical records

const express = require('express');
const { query, pool } = require('../database.js');
const router = express.Router();

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 50);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET /api/exams - List all exams with components and filter options
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const year = req.query.year ? parseInt(req.query.year) : null;
        const month = req.query.month && req.query.month !== 'all' ? parseInt(req.query.month) : null;
        const status = req.query.status && req.query.status !== 'all' ? req.query.status.trim().toLowerCase() : null;
        const type = req.query.type && req.query.type !== 'all' ? req.query.type.trim().toLowerCase() : null;
        const classId = req.query.class_id ? parseInt(req.query.class_id) : null;
        const search = req.query.search ? req.query.search.trim().toLowerCase() : null;

        let sql = `
            SELECT ep.*,
                   COALESCE(ep.status, CASE WHEN ep.is_locked THEN 'locked' WHEN ep.is_archived THEN 'closed' ELSE 'open' END) AS current_status,
                   c.name AS class_name,
                   (SELECT COUNT(DISTINCT r.student_id) FROM results r WHERE r.period_id = ep.id AND r.deleted_at IS NULL) AS student_count,
                   (SELECT COUNT(*) FROM results r WHERE r.period_id = ep.id AND r.deleted_at IS NULL) AS result_count
            FROM exam_periods ep
            LEFT JOIN classes c ON c.id = ep.class_id
            WHERE ep.deleted_at IS NULL
        `;
        const params = [];
        let idx = 1;

        if (year) {
            sql += ` AND (ep.year = $${idx} OR ep.academic_year = CAST($${idx} AS TEXT))`;
            params.push(year);
            idx++;
        }
        if (month) {
            sql += ` AND ep.month = $${idx++}`;
            params.push(month);
        }
        if (status) {
            sql += ` AND (LOWER(COALESCE(ep.status, 'open')) = $${idx} OR ($${idx} = 'locked' AND ep.is_locked = true))`;
            params.push(status);
            idx++;
        }
        if (type) {
            sql += ` AND (LOWER(ep.period_type) = $${idx} OR LOWER(COALESCE(ep.exam_type, '')) = $${idx})`;
            params.push(type);
            idx++;
        }
        if (classId) {
            sql += ` AND (ep.class_id = $${idx} OR ep.id IN (SELECT exam_id FROM exam_classes WHERE class_id = $${idx}) OR ep.class_id IS NULL)`;
            params.push(classId);
            idx++;
        }
        if (search) {
            sql += ` AND (LOWER(ep.name) LIKE $${idx} OR LOWER(COALESCE(ep.exam_code, '')) LIKE $${idx})`;
            params.push(`%${search}%`);
            idx++;
        }

        sql += ` ORDER BY ep.year DESC, ep.month DESC NULLS LAST, ep.id DESC`;
        const { rows: exams } = await query(sql, params);

        // Fetch all components for these exams
        const examIds = exams.map(e => e.id);
        let componentsMap = {};
        let classesMap = {};

        if (examIds.length > 0) {
            const { rows: allComps } = await query(`
                SELECT * FROM exam_components 
                WHERE exam_id = ANY($1::int[]) AND deleted_at IS NULL
                ORDER BY exam_id, order_num ASC, id ASC
            `, [examIds]);

            allComps.forEach(c => {
                if (!componentsMap[c.exam_id]) componentsMap[c.exam_id] = [];
                componentsMap[c.exam_id].push({
                    id: c.id,
                    name: c.name,
                    component_key: c.component_key,
                    max_marks: parseFloat(c.max_marks),
                    order_num: c.order_num
                });
            });

            const { rows: assignedClasses } = await query(`
                SELECT ec.exam_id, ec.class_id, c.name as class_name
                FROM exam_classes ec
                JOIN classes c ON c.id = ec.class_id
                WHERE ec.exam_id = ANY($1::int[]) AND c.deleted_at IS NULL
            `, [examIds]);

            assignedClasses.forEach(ac => {
                if (!classesMap[ac.exam_id]) classesMap[ac.exam_id] = [];
                classesMap[ac.exam_id].push({ id: ac.class_id, name: ac.class_name });
            });
        }

        exams.forEach(e => {
            e.month_name = e.month ? MONTH_NAMES[e.month - 1] : null;
            e.components = componentsMap[e.id] || [];
            e.classes = classesMap[e.id] || [];
            e.total_marks = parseFloat(e.total_marks) || 100.00;
            e.status = e.current_status || (e.is_locked ? 'locked' : (e.is_archived ? 'closed' : 'open'));
            e.num_components = e.components.length || e.num_components || 3;
        });

        res.json(exams);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/exams/class/:classId - Return exams available for a class
// ─────────────────────────────────────────────────────────────────────────────
router.get('/class/:classId', async (req, res) => {
    try {
        const classId = parseInt(req.params.classId);
        if (isNaN(classId)) return res.status(400).json({ error: 'Invalid class ID.' });

        const { rows: exams } = await query(`
            SELECT ep.*,
                   COALESCE(ep.status, CASE WHEN ep.is_locked THEN 'locked' WHEN ep.is_archived THEN 'closed' ELSE 'open' END) AS current_status,
                   EXISTS(SELECT 1 FROM exam_classes ec WHERE ec.exam_id = ep.id AND ec.class_id = $1) AS is_assigned
            FROM exam_periods ep
            WHERE ep.deleted_at IS NULL
              AND (
                ep.class_id = $1
                OR ep.class_id IS NULL
                OR ep.id IN (SELECT exam_id FROM exam_classes WHERE class_id = $1)
                OR NOT EXISTS (SELECT 1 FROM exam_classes WHERE exam_id = ep.id)
              )
            ORDER BY ep.year DESC, ep.month DESC NULLS LAST, ep.id DESC
        `, [classId]);

        const examIds = exams.map(e => e.id);
        let componentsMap = {};

        if (examIds.length > 0) {
            const { rows: allComps } = await query(`
                SELECT * FROM exam_components 
                WHERE exam_id = ANY($1::int[]) AND deleted_at IS NULL
                ORDER BY exam_id, order_num ASC, id ASC
            `, [examIds]);

            allComps.forEach(c => {
                if (!componentsMap[c.exam_id]) componentsMap[c.exam_id] = [];
                componentsMap[c.exam_id].push({
                    id: c.id,
                    name: c.name,
                    component_key: c.component_key,
                    max_marks: parseFloat(c.max_marks),
                    order_num: c.order_num
                });
            });
        }

        exams.forEach(e => {
            e.month_name = e.month ? MONTH_NAMES[e.month - 1] : null;
            e.components = componentsMap[e.id] || [];
            e.total_marks = parseFloat(e.total_marks) || 100.00;
            e.status = e.current_status || (e.is_locked ? 'locked' : 'open');
        });

        res.json(exams);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GET /api/exams/:id - Detailed exam with components & assigned subjects
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        const examId = parseInt(req.params.id);
        if (isNaN(examId)) return res.status(400).json({ error: 'Invalid exam ID.' });

        const { rows: examRows } = await query(`
            SELECT ep.*,
                   COALESCE(ep.status, CASE WHEN ep.is_locked THEN 'locked' WHEN ep.is_archived THEN 'closed' ELSE 'open' END) AS current_status,
                   c.name AS class_name
            FROM exam_periods ep
            LEFT JOIN classes c ON c.id = ep.class_id
            WHERE ep.id = $1 AND ep.deleted_at IS NULL
        `, [examId]);

        if (!examRows[0]) return res.status(404).json({ error: 'Exam not found.' });
        const exam = examRows[0];
        exam.month_name = exam.month ? MONTH_NAMES[exam.month - 1] : null;

        // Fetch components
        const { rows: components } = await query(`
            SELECT id, name, component_key, max_marks, order_num
            FROM exam_components
            WHERE exam_id = $1 AND deleted_at IS NULL
            ORDER BY order_num ASC, id ASC
        `, [examId]);
        exam.components = components.map(c => ({
            id: c.id,
            name: c.name,
            component_key: c.component_key,
            max_marks: parseFloat(c.max_marks),
            order_num: c.order_num
        }));

        // Fetch participating classes
        const { rows: classes } = await query(`
            SELECT c.id, c.name, c.room
            FROM exam_classes ec
            JOIN classes c ON c.id = ec.class_id
            WHERE ec.exam_id = $1 AND c.deleted_at IS NULL
            ORDER BY c.name ASC
        `, [examId]);
        exam.classes = classes;

        // Fetch participating subjects
        const { rows: subjects } = await query(`
            SELECT class_id, subject_name
            FROM exam_subjects
            WHERE exam_id = $1
            ORDER BY subject_name ASC
        `, [examId]);
        exam.subjects = subjects;

        res.json(exam);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. POST /api/exams - Create a new exam with 3 or 4 components (validates sum = 100)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const client = await pool.connect();
    try {
        const {
            name,
            academicYear = '2026',
            month,
            examType = 'monthly',
            totalMarks = 100,
            components = [],
            classIds = [],
            subjectNames = [],
            startDate,
            endDate,
            createdBy = 'Admin'
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Exam name is required.' });
        }

        const monthNum = month && month !== 'all' ? parseInt(month) : null;
        if (monthNum && (monthNum < 1 || monthNum > 12)) {
            return res.status(400).json({ error: 'Month must be between 1 and 12.' });
        }

        const totMarks = parseFloat(totalMarks) || 100.00;

        // Validate Components (must be 3 or 4 components)
        if (!Array.isArray(components) || (components.length !== 3 && components.length !== 4)) {
            return res.status(400).json({
                error: `An exam must have either 3 or 4 assessment components (received ${Array.isArray(components) ? components.length : 0}).`
            });
        }

        let sumMarks = 0;
        for (let i = 0; i < components.length; i++) {
            const comp = components[i];
            const compName = (comp.name || '').trim();
            const compMax = parseFloat(comp.max_marks || comp.maxMarks || 0);

            if (!compName) {
                return res.status(400).json({ error: `Component #${i + 1} must have a name.` });
            }
            if (compMax <= 0) {
                return res.status(400).json({ error: `Component "${compName}" must have maximum marks greater than 0.` });
            }
            sumMarks += compMax;
        }

        // Strict validation: Sum must equal totalMarks (100)
        if (Math.abs(sumMarks - totMarks) > 0.01) {
            return res.status(400).json({
                error: `The sum of all assessment components must equal ${totMarks} marks. Currently it equals ${sumMarks} marks.`
            });
        }

        const finalYear = parseInt(academicYear) || 2026;
        const examCode = `EXAM-${finalYear}-${monthNum ? 'M' + String(monthNum).padStart(2, '0') : 'GEN'}-${Date.now().toString().slice(-4)}`;

        await client.query('BEGIN');

        const isPublished = (req.body.isPublished === true || req.body.is_published === true);

        // 1. Insert into exam_periods
        const { rows: insertedExam } = await client.query(`
            INSERT INTO exam_periods (
                name, year, month, period_type, academic_year, exam_code, total_marks, num_components,
                status, is_active, is_archived, is_locked, is_published, start_date, end_date, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', true, false, false, $12, $9, $10, $11)
            RETURNING *
        `, [
            name.trim(), finalYear, monthNum, examType, String(finalYear), examCode, totMarks, components.length,
            startDate || null, endDate || null, createdBy, isPublished
        ]);
        const exam = insertedExam[0];

        // 2. Insert components
        const savedComponents = [];
        for (let i = 0; i < components.length; i++) {
            const comp = components[i];
            const key = comp.component_key || slugify(comp.name) || `comp_${i + 1}`;
            const max = parseFloat(comp.max_marks || comp.maxMarks);

            const { rows: compRow } = await client.query(`
                INSERT INTO exam_components (exam_id, name, component_key, max_marks, order_num)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [exam.id, comp.name.trim(), key, max, i + 1]);

            savedComponents.push(compRow[0]);
        }

        // 3. Assign classes
        if (Array.isArray(classIds) && classIds.length > 0) {
            for (const cid of classIds) {
                const cIdInt = parseInt(cid);
                if (!isNaN(cIdInt)) {
                    await client.query(`
                        INSERT INTO exam_classes (exam_id, class_id)
                        VALUES ($1, $2) ON CONFLICT DO NOTHING
                    `, [exam.id, cIdInt]);

                    // Assign subjects for this class if provided
                    if (Array.isArray(subjectNames) && subjectNames.length > 0) {
                        for (const subj of subjectNames) {
                            if (subj && subj.trim()) {
                                await client.query(`
                                    INSERT INTO exam_subjects (exam_id, class_id, subject_name)
                                    VALUES ($1, $2, $3)
                                    ON CONFLICT DO NOTHING
                                `, [exam.id, cIdInt, subj.trim()]);
                            }
                        }
                    }
                }
            }
        } else {
            // By default, assign all existing classes so all teachers have access
            await client.query(`
                INSERT INTO exam_classes (exam_id, class_id)
                SELECT $1, id FROM classes WHERE deleted_at IS NULL
                ON CONFLICT DO NOTHING
            `, [exam.id]);
        }

        // 4. Log in audit logs
        await client.query(`
            INSERT INTO exam_audit_logs (exam_id, action, old_status, new_status, changed_by, reason)
            VALUES ($1, 'CREATE', NULL, 'open', $2, 'Exam created with ' || $3 || ' assessment components.')
        `, [exam.id, createdBy, components.length]);

        await client.query('COMMIT');

        exam.components = savedComponents;
        exam.status = 'open';
        exam.month_name = exam.month ? MONTH_NAMES[exam.month - 1] : null;

        res.status(201).json(exam);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. PUT /api/exams/:id - Update Exam details and assessment components
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    const examId = parseInt(req.params.id);
    if (isNaN(examId)) return res.status(400).json({ error: 'Invalid exam ID.' });

    const client = await pool.connect();
    try {
        const {
            name,
            academicYear,
            month,
            examType,
            totalMarks = 100,
            components,
            classIds,
            startDate,
            endDate,
            changedBy = 'Admin'
        } = req.body;

        // Check current status
        const { rows: cur } = await client.query(`SELECT * FROM exam_periods WHERE id = $1 AND deleted_at IS NULL`, [examId]);
        if (!cur[0]) return res.status(404).json({ error: 'Exam not found.' });

        if (cur[0].status === 'locked' || cur[0].is_locked) {
            return res.status(403).json({
                error: 'This exam is locked. Please unlock or reopen it first before making structural modifications.'
            });
        }

        await client.query('BEGIN');

        const monthNum = month && month !== 'all' ? parseInt(month) : null;
        await client.query(`
            UPDATE exam_periods 
            SET name = COALESCE($1, name),
                academic_year = COALESCE($2, academic_year),
                month = COALESCE($3, month),
                period_type = COALESCE($4, period_type),
                total_marks = COALESCE($5, total_marks),
                start_date = $6,
                end_date = $7,
                updated_at = NOW()
            WHERE id = $8
        `, [
            name ? name.trim() : null,
            academicYear ? String(academicYear) : null,
            monthNum,
            examType || null,
            totalMarks ? parseFloat(totalMarks) : null,
            startDate || null,
            endDate || null,
            examId
        ]);

        // If components were updated
        if (Array.isArray(components) && (components.length === 3 || components.length === 4)) {
            let sum = 0;
            components.forEach(c => sum += parseFloat(c.max_marks || c.maxMarks || 0));
            if (Math.abs(sum - (parseFloat(totalMarks) || 100)) > 0.01) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Component marks sum (${sum}) must equal ${totalMarks}.` });
            }

            // Remove existing components and insert updated ones
            await client.query(`DELETE FROM exam_components WHERE exam_id = $1`, [examId]);
            for (let i = 0; i < components.length; i++) {
                const c = components[i];
                const key = c.component_key || slugify(c.name) || `comp_${i + 1}`;
                await client.query(`
                    INSERT INTO exam_components (exam_id, name, component_key, max_marks, order_num)
                    VALUES ($1, $2, $3, $4, $5)
                `, [examId, c.name.trim(), key, parseFloat(c.max_marks || c.maxMarks), i + 1]);
            }
        }

        // If classIds provided
        if (Array.isArray(classIds)) {
            await client.query(`DELETE FROM exam_classes WHERE exam_id = $1`, [examId]);
            for (const cid of classIds) {
                await client.query(`INSERT INTO exam_classes (exam_id, class_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [examId, parseInt(cid)]);
            }
        }

        await client.query(`
            INSERT INTO exam_audit_logs (exam_id, action, old_status, new_status, changed_by, reason)
            VALUES ($1, 'UPDATE', $2, $2, $3, 'Exam configurations updated.')
        `, [examId, cur[0].status || 'open', changedBy]);

        await client.query('COMMIT');
        res.json({ message: 'Exam configuration updated successfully.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. PUT /api/exams/:id/status - Transition lifecycle (draft, open, closed, locked)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/status', async (req, res) => {
    const examId = parseInt(req.params.id);
    const { status, changedBy = 'Admin', reason } = req.body;

    if (!['draft', 'open', 'closed', 'locked'].includes(status)) {
        return res.status(400).json({ error: 'Status must be draft, open, closed, or locked.' });
    }

    try {
        const { rows: examRows } = await query(`SELECT * FROM exam_periods WHERE id = $1 AND deleted_at IS NULL`, [examId]);
        if (!examRows[0]) return res.status(404).json({ error: 'Exam not found.' });

        const oldStatus = examRows[0].status || (examRows[0].is_locked ? 'locked' : 'open');
        const isLocked = status === 'locked';
        const isActive = status === 'open';

        await query(`
            UPDATE exam_periods 
            SET status = $1, is_locked = $2, is_active = $3, updated_at = NOW() 
            WHERE id = $4
        `, [status, isLocked, isActive, examId]);

        // If locked, lock corresponding results so teacher submissions cannot be altered
        if (isLocked) {
            await query(`UPDATE results SET is_locked = true, edit_allowed = false WHERE period_id = $1`, [examId]);
        }

        // Record in audit log
        await query(`
            INSERT INTO exam_audit_logs (exam_id, action, old_status, new_status, changed_by, reason)
            VALUES ($1, 'STATUS_CHANGE', $2, $3, $4, $5)
        `, [examId, oldStatus, status, changedBy, reason || `Status changed from ${oldStatus} to ${status}`]);

        res.json({
            message: `Exam status transitioned to "${status}".`,
            examId,
            status,
            isLocked
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. PUT /api/exams/:id/reopen - Unlock and reopen a closed or locked exam
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/reopen', async (req, res) => {
    const examId = parseInt(req.params.id);
    const { changedBy = 'Admin', reason } = req.body;

    if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'A valid reason or authorization note is required to reopen an exam.' });
    }

    try {
        const { rows: examRows } = await query(`SELECT * FROM exam_periods WHERE id = $1 AND deleted_at IS NULL`, [examId]);
        if (!examRows[0]) return res.status(404).json({ error: 'Exam not found.' });

        const oldStatus = examRows[0].status || 'locked';

        await query(`
            UPDATE exam_periods 
            SET status = 'open', is_locked = false, is_active = true, updated_at = NOW() 
            WHERE id = $1
        `, [examId]);

        // Unlock results for this period so teachers can submit corrected marks
        await query(`UPDATE results SET is_locked = false, edit_allowed = true WHERE period_id = $1`, [examId]);

        // Audit log
        await query(`
            INSERT INTO exam_audit_logs (exam_id, action, old_status, new_status, changed_by, reason)
            VALUES ($1, 'REOPEN', $2, 'open', $3, $4)
        `, [examId, oldStatus, changedBy, reason.trim()]);

        res.json({
            message: `Exam successfully reopened for marks entry.`,
            status: 'open',
            is_locked: false
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. GET /api/exams/:id/tracker - Teacher marks submission tracker for an exam
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/tracker', async (req, res) => {
    try {
        const examId = parseInt(req.params.id);
        const { rows: examRows } = await query(`SELECT * FROM exam_periods WHERE id = $1 AND deleted_at IS NULL`, [examId]);
        if (!examRows[0]) return res.status(404).json({ error: 'Exam not found.' });

        // Retrieve all participating classes and their teachers/subjects
        const { rows: trackerData } = await query(`
            SELECT 
                c.id AS class_id,
                c.name AS class_name,
                u.id AS teacher_id,
                COALESCE(u.name, 'Unassigned') AS teacher_name,
                COALESCE(u.subject, 'General') AS subject_name,
                (
                    SELECT COUNT(*) 
                    FROM students s 
                    WHERE (s.classid = c.id OR s.id IN (SELECT student_id FROM class_students cs WHERE cs.class_id = c.id AND cs.deleted_at IS NULL))
                      AND s.deleted_at IS NULL
                ) AS total_students,
                (
                    SELECT COUNT(DISTINCT r.student_id) 
                    FROM results r 
                    WHERE r.period_id = $1 
                      AND r.student_id IN (
                          SELECT s.id 
                          FROM students s 
                          WHERE (s.classid = c.id OR s.id IN (SELECT student_id FROM class_students cs WHERE cs.class_id = c.id AND cs.deleted_at IS NULL))
                            AND s.deleted_at IS NULL
                      )
                      AND r.deleted_at IS NULL
                ) AS graded_students,
                (
                    SELECT COUNT(*) 
                    FROM results r 
                    WHERE r.period_id = $1 
                      AND r.student_id IN (
                          SELECT s.id 
                          FROM students s 
                          WHERE (s.classid = c.id OR s.id IN (SELECT student_id FROM class_students cs WHERE cs.class_id = c.id AND cs.deleted_at IS NULL))
                            AND s.deleted_at IS NULL
                      )
                      AND r.deleted_at IS NULL
                ) AS total_records,
                (
                    SELECT COUNT(*) 
                    FROM results r 
                    WHERE r.period_id = $1 
                      AND r.student_id IN (
                          SELECT s.id 
                          FROM students s 
                          WHERE (s.classid = c.id OR s.id IN (SELECT student_id FROM class_students cs WHERE cs.class_id = c.id AND cs.deleted_at IS NULL))
                            AND s.deleted_at IS NULL
                      )
                      AND r.approval_status = 'approved'
                      AND r.deleted_at IS NULL
                ) AS approved_count,
                (
                    SELECT COUNT(*) 
                    FROM results r 
                    WHERE r.period_id = $1 
                      AND r.student_id IN (
                          SELECT s.id 
                          FROM students s 
                          WHERE (s.classid = c.id OR s.id IN (SELECT student_id FROM class_students cs WHERE cs.class_id = c.id AND cs.deleted_at IS NULL))
                            AND s.deleted_at IS NULL
                      )
                      AND r.approval_status = 'pending'
                      AND r.deleted_at IS NULL
                ) AS pending_count,
                (
                    SELECT MAX(r.submitted_at) 
                    FROM results r 
                    WHERE r.period_id = $1 
                      AND r.student_id IN (
                          SELECT s.id 
                          FROM students s 
                          WHERE (s.classid = c.id OR s.id IN (SELECT student_id FROM class_students cs WHERE cs.class_id = c.id AND cs.deleted_at IS NULL))
                            AND s.deleted_at IS NULL
                      )
                      AND r.deleted_at IS NULL
                ) AS last_submitted_at
            FROM classes c
            LEFT JOIN users u ON u.id = c.teacherid AND u.role = 'Teacher'
            WHERE c.deleted_at IS NULL
              AND (
                c.id IN (SELECT class_id FROM exam_classes WHERE exam_id = $1)
                OR NOT EXISTS (SELECT 1 FROM exam_classes WHERE exam_id = $1)
              )
            ORDER BY c.name ASC
        `, [examId]);

        const submissions = trackerData.map(t => {
            const total = parseInt(t.total_students) || 0;
            const graded = parseInt(t.graded_students) || 0;
            const totalRec = parseInt(t.total_records) || 0;
            const approved = parseInt(t.approved_count) || 0;
            const pending = parseInt(t.pending_count) || 0;

            let submissionState = 'Not Started';
            if (graded > 0 && graded >= total) submissionState = 'Submitted';
            else if (graded > 0) submissionState = 'In Progress';

            return {
                class_id: t.class_id,
                classId: t.class_id,
                class_name: t.class_name,
                className: t.class_name,
                teacher_id: t.teacher_id,
                teacherId: t.teacher_id,
                teacher_name: t.teacher_name,
                teacherName: t.teacher_name,
                submitted_by: t.teacher_name,
                subject: t.subject_name,
                total_students: total,
                totalStudents: total,
                graded_students: graded,
                gradedStudents: graded,
                total_records: totalRec,
                totalRecords: totalRec,
                approved_count: approved,
                approvedCount: approved,
                pending_count: pending,
                pendingCount: pending,
                submissionState,
                approvalStatus: approved > 0 ? (pending > 0 ? 'partially_approved' : 'approved') : (pending > 0 ? 'pending' : 'none'),
                last_submission: t.last_submitted_at,
                lastSubmittedAt: t.last_submitted_at
            };
        });

        res.json({
            exam: examRows[0],
            tracker: submissions,
            submissions: submissions
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8b. PUT /api/exams/:id/release - Toggle result publication / release to students
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/release', async (req, res) => {
    try {
        const examId = parseInt(req.params.id);
        const { rows: examRows } = await query(`SELECT * FROM exam_periods WHERE id = $1 AND deleted_at IS NULL`, [examId]);
        if (!examRows[0]) return res.status(404).json({ error: 'Exam not found.' });

        const isPublished = (req.body.isPublished === true || req.body.isPublished === 'true' || req.body.is_published === true);
        const changedBy = req.body.changedBy || 'Admin';
        const reason = req.body.reason || (isPublished ? 'Exam results released to students' : 'Exam results hidden from students');

        await query(`UPDATE exam_periods SET is_published = $1, updated_at = NOW() WHERE id = $2`, [isPublished, examId]);

        await query(`
            INSERT INTO exam_audit_logs (exam_id, action, old_status, new_status, changed_by, reason)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            examId,
            isPublished ? 'RELEASE_RESULTS' : 'UNRELEASE_RESULTS',
            examRows[0].status || 'open',
            isPublished ? 'released' : 'hidden',
            changedBy,
            reason
        ]).catch(() => {});

        res.json({
            message: isPublished ? 'Exam results released to students successfully.' : 'Exam results hidden from students.',
            examId,
            isPublished
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/publish', async (req, res) => {
    req.body = { ...req.body, isPublished: true };
    return router.handle(req, res);
});

router.put('/:id/unpublish', async (req, res) => {
    req.body = { ...req.body, isPublished: false };
    return router.handle(req, res);
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. GET /api/exams/:id/audit-logs - Audit trail
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/audit-logs', async (req, res) => {
    try {
        const examId = parseInt(req.params.id);
        const { rows } = await query(`
            SELECT * FROM exam_audit_logs 
            WHERE exam_id = $1 
            ORDER BY created_at DESC
        `, [examId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. POST /api/exams/aggregate - Configure and calculate final/aggregate results
// ─────────────────────────────────────────────────────────────────────────────
router.post('/aggregate/calculate', async (req, res) => {
    try {
        const {
            name = 'Final Academic Evaluation',
            academicYear = '2026',
            classId,
            calculationMethod = 'weighted', // 'weighted' or 'average'
            weights = {}, // { "1": 20, "2": 20, "3": 60 } -> period_id to percentage weight
            isPublished = false,
            createdBy = 'Admin'
        } = req.body;

        const targetClassId = classId ? parseInt(classId) : null;
        const examPeriodIds = Object.keys(weights).map(k => parseInt(k)).filter(n => !isNaN(n));

        if (examPeriodIds.length === 0) {
            return res.status(400).json({ error: 'Please select at least one exam to calculate aggregate results.' });
        }

        // Validate weights if weighted calculation
        if (calculationMethod === 'weighted') {
            const sumWeights = Object.values(weights).reduce((a, b) => a + parseFloat(b || 0), 0);
            if (Math.abs(sumWeights - 100) > 0.1) {
                return res.status(400).json({ error: `Weights must sum to 100% (currently ${sumWeights}%).` });
            }
        }

        // Fetch students in class
        let studentSql = `SELECT id, name, student_id_code, grade FROM students WHERE deleted_at IS NULL`;
        const studentParams = [];
        if (targetClassId) {
            studentSql += ` AND (classid = $1 OR id IN (SELECT student_id FROM class_students WHERE class_id = $1))`;
            studentParams.push(targetClassId);
        }
        const { rows: students } = await query(studentSql, studentParams);

        // Fetch all approved results for these exams
        const { rows: results } = await query(`
            SELECT r.student_id, r.subject, r.score, r.max_score, r.period_id, ep.name AS period_name,
                   COALESCE(ep.total_marks, 100.00) AS exam_total_marks
            FROM results r
            JOIN exam_periods ep ON ep.id = r.period_id
            WHERE r.period_id = ANY($1::int[]) AND r.approval_status = 'approved' AND r.deleted_at IS NULL
        `, [examPeriodIds]);

        // Organize and compute per student
        const aggregatedStudents = students.map(s => {
            const sResults = results.filter(r => r.student_id === s.id);
            const subjectsMap = {};

            sResults.forEach(r => {
                if (!subjectsMap[r.subject]) subjectsMap[r.subject] = {};
                if (!subjectsMap[r.subject][r.period_id]) {
                    subjectsMap[r.subject][r.period_id] = { 
                        obtained: 0, 
                        max: 0,
                        examTotal: parseFloat(r.exam_total_marks) || 100 
                    };
                }
                subjectsMap[r.subject][r.period_id].obtained += parseFloat(r.score) || 0;
                subjectsMap[r.subject][r.period_id].max += parseFloat(r.max_score) || 0;
            });

            // Compute aggregate for each subject
            const subjectAverages = {};
            let totalMarks = 0;
            let subjectCount = 0;

            for (const [subj, pMap] of Object.entries(subjectsMap)) {
                let subjFinal = 0;
                if (calculationMethod === 'weighted') {
                    for (const pid of examPeriodIds) {
                        const w = (parseFloat(weights[pid]) || 0) / 100;
                        const pData = pMap[pid];
                        const totalBasis = pData && pData.max > 0 ? pData.max : (pData ? pData.examTotal : 100);
                        const periodPct = pData ? (pData.obtained / totalBasis) * 100 : 0;
                        subjFinal += periodPct * w;
                    }
                } else {
                    const periodsList = Object.values(pMap);
                    const periodPcts = periodsList.map(pData => {
                        const totalBasis = pData.max > 0 ? pData.max : pData.examTotal;
                        return (pData.obtained / totalBasis) * 100;
                    });
                    subjFinal = periodPcts.length > 0 ? (periodPcts.reduce((a, b) => a + b, 0) / periodPcts.length) : 0;
                }
                subjectAverages[subj] = Math.round(subjFinal * 10) / 10;
                totalMarks += subjFinal;
                subjectCount++;
            }

            const overallPct = subjectCount > 0 ? Math.round((totalMarks / subjectCount) * 10) / 10 : 0;

            return {
                studentId: s.id,
                studentName: s.name,
                studentCode: s.student_id_code || ('BB' + (260000 + s.id)),
                subjects: subjectAverages,
                overallPercentage: overallPct,
                grade: overallPct >= 90 ? 'A+' : (overallPct >= 80 ? 'A' : (overallPct >= 70 ? 'B' : (overallPct >= 60 ? 'C' : (overallPct >= 50 ? 'D' : 'F'))))
            };
        });

        // Save configuration to DB
        const { rows: savedConfig } = await query(`
            INSERT INTO exam_aggregate_configs (name, academic_year, class_id, calculation_method, weights_json, is_published, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [name, academicYear, targetClassId, calculationMethod, JSON.stringify(weights), isPublished, createdBy]);

        res.json({
            configId: savedConfig[0].id,
            name,
            calculationMethod,
            weights,
            studentCount: aggregatedStudents.length,
            results: aggregatedStudents
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. DELETE /api/exams/:id - Delete exam (cascades marks & components cleanup)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const examId = parseInt(req.params.id);
        const permanent = req.query.permanent === 'true';

        const { rows: examRows } = await query(`SELECT * FROM exam_periods WHERE id = $1`, [examId]);
        if (!examRows[0]) return res.status(404).json({ error: 'Exam not found.' });

        const examName = examRows[0].name;

        if (permanent) {
            await query(`DELETE FROM results WHERE period_id = $1`, [examId]);
            await query(`DELETE FROM exam_attendance WHERE period_id = $1`, [examId]).catch(() => {});
            await query(`DELETE FROM exam_components WHERE exam_id = $1`, [examId]).catch(() => {});
            await query(`DELETE FROM exam_classes WHERE exam_id = $1`, [examId]).catch(() => {});
            await query(`DELETE FROM exam_subjects WHERE exam_id = $1`, [examId]).catch(() => {});
            await query(`DELETE FROM exam_audit_logs WHERE exam_id = $1`, [examId]).catch(() => {});
            await query(`DELETE FROM exam_periods WHERE id = $1`, [examId]);
        } else {
            // Cascade soft-delete: archive marks and exam so they no longer appear in student results or active cycles
            await query(`UPDATE results SET deleted_at = NOW() WHERE period_id = $1 AND deleted_at IS NULL`, [examId]);
            await query(`UPDATE exam_attendance SET deleted_at = NOW() WHERE period_id = $1 AND deleted_at IS NULL`, [examId]).catch(() => {});
            await query(`UPDATE exam_components SET deleted_at = NOW() WHERE exam_id = $1 AND deleted_at IS NULL`, [examId]).catch(() => {});
            await query(`UPDATE exam_periods SET deleted_at = NOW(), is_active = false, is_published = false, status = 'deleted' WHERE id = $1`, [examId]);

            await query(`
                INSERT INTO exam_audit_logs (exam_id, action, old_status, new_status, changed_by, reason)
                VALUES ($1, 'DELETE', $2, 'deleted', $3, $4)
            `, [examId, examRows[0].status || 'open', req.body?.changedBy || 'Admin', 'Exam and associated records deleted by administrator']).catch(() => {});
        }

        res.json({ message: `Exam "${examName}" deleted successfully.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
