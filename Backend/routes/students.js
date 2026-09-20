const express = require('express');
const multer = require('multer');
const bcrypt = require('bcrypt');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { query } = require('../database.js');
const { formatStudentId } = require('./admission-batches.js');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

function makeBBId(id) {
    return 'BB' + String(260000 + parseInt(id)).padStart(6, '0');
}

// GET all students with comprehensive filters
router.get('/', async (req, res) => {
    try {
        const { academic_year, admission_batch_id, status, classid, search } = req.query;
        let sql = `
            SELECT s.*, 
                   u.name AS parent_name,
                   c.name AS class_name,
                   b.year_label AS batch_year,
                   b.id_prefix AS batch_prefix,
                   COALESCE(sa.plain_password, '') AS plain_password,
                   sa.must_change,
                   sa.last_changed
            FROM students s 
            LEFT JOIN users u ON u.id = s.parentid 
            LEFT JOIN classes c ON c.id = s.classid
            LEFT JOIN admission_batches b ON b.id = s.admission_batch_id
            LEFT JOIN student_auth sa ON sa.student_id = s.id
            WHERE s.deleted_at IS NULL
        `;
        const params = [];
        let idx = 1;

        if (academic_year && academic_year !== 'all') {
            sql += ` AND s.academic_year = $${idx++}`;
            params.push(academic_year);
        }
        if (admission_batch_id && admission_batch_id !== 'all') {
            sql += ` AND s.admission_batch_id = $${idx++}`;
            params.push(parseInt(admission_batch_id));
        }
        if (status && status !== 'all') {
            sql += ` AND LOWER(s.status) = LOWER($${idx++})`;
            params.push(status);
        }
        if (classid && classid !== 'all') {
            sql += ` AND s.classid = $${idx++}`;
            params.push(parseInt(classid));
        }
        if (search && search.trim()) {
            sql += ` AND (s.name ILIKE $${idx} OR s.student_id_code ILIKE $${idx} OR CAST(s.id AS TEXT) ILIKE $${idx})`;
            params.push(`%${search.trim()}%`);
            idx++;
        }

        sql += ` ORDER BY s.id ASC`;
        const { rows } = await query(sql, params);

        const mapped = rows.map(s => ({
            ...s,
            student_id_code: s.student_id_code || makeBBId(s.id),
            bb_id: s.student_id_code || makeBBId(s.id),
            bbId: s.student_id_code || makeBBId(s.id),
            status: s.status || 'Active'
        }));
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single student complete profile
router.get('/:id', async (req, res) => {
    const studentId = parseInt(req.params.id);
    try {
        const { rows } = await query(`
            SELECT s.*, 
                   u.name AS parent_name,
                   c.name AS class_name,
                   b.year_label AS batch_year,
                   b.id_prefix AS batch_prefix,
                   COALESCE(sa.plain_password, '') AS plain_password,
                   sa.must_change,
                   sa.last_changed
            FROM students s 
            LEFT JOIN users u ON u.id = s.parentid 
            LEFT JOIN classes c ON c.id = s.classid
            LEFT JOIN admission_batches b ON b.id = s.admission_batch_id
            LEFT JOIN student_auth sa ON sa.student_id = s.id
            WHERE s.id = $1 AND s.deleted_at IS NULL
        `, [studentId]);

        if (!rows[0]) return res.status(404).json({ error: 'Student not found' });
        const s = rows[0];
        s.student_id_code = s.student_id_code || makeBBId(s.id);
        s.bb_id = s.student_id_code;
        s.bbId = s.student_id_code;
        s.status = s.status || 'Active';
        res.json(s);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET complete academic history for a student across all academic years
router.get('/:id/academic-history', async (req, res) => {
    const studentId = parseInt(req.params.id);
    try {
        // 1. Basic student info
        const { rows: studentRows } = await query(`
            SELECT s.*, b.year_label AS batch_year 
            FROM students s
            LEFT JOIN admission_batches b ON b.id = s.admission_batch_id
            WHERE s.id = $1 AND s.deleted_at IS NULL
        `, [studentId]);
        if (!studentRows[0]) return res.status(404).json({ error: 'Student not found' });
        const student = studentRows[0];
        student.student_id_code = student.student_id_code || makeBBId(student.id);

        // 2. Annual history records from student_academic_history
        const { rows: historyRecords } = await query(`
            SELECT * FROM student_academic_history 
            WHERE student_id = $1 ORDER BY academic_year DESC, id DESC
        `, [studentId]);

        // 3. All exam results grouped by academic year & exam period
        const { rows: examResults } = await query(`
            SELECT r.*, ep.name AS period_name, ep.period_type, ep.month, ep.year,
                   c.name AS class_name
            FROM results r
            LEFT JOIN exam_periods ep ON ep.id = r.period_id
            LEFT JOIN classes c ON c.id = ep.class_id
            WHERE r.student_id = $1 AND r.deleted_at IS NULL
            ORDER BY r.academic_year DESC, r.period_id DESC, r.id ASC
        `, [studentId]);

        // 4. Certificates awarded
        const { rows: certs } = await query(`
            SELECT * FROM certificates 
            WHERE student_id = $1 AND deleted_at IS NULL
            ORDER BY issue_date DESC, id DESC
        `, [studentId]);

        // 5. Classes enrolled historically
        const { rows: enrolledClasses } = await query(`
            SELECT cs.*, c.name AS class_name, c.room, c.color
            FROM class_students cs
            JOIN classes c ON c.id = cs.class_id
            WHERE cs.student_id = $1 AND cs.deleted_at IS NULL
            ORDER BY cs.assigned_at DESC
        `, [studentId]);

        res.json({
            student,
            annualHistory: historyRecords,
            examResults,
            certificates: certs,
            enrolledClasses
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create new student with dynamic ID generation
router.post('/', async (req, res) => {
    const { 
        name, grade, enrollmentDate, birthDate, attendance, parentid, 
        password, student_id_code, admission_batch_id, academic_year, status, remarks 
    } = req.body;

    try {
        // Resolve active admission batch
        let batch = null;
        if (admission_batch_id) {
            const { rows } = await query(`SELECT * FROM admission_batches WHERE id = $1 AND deleted_at IS NULL`, [admission_batch_id]);
            batch = rows[0];
        }
        if (!batch) {
            const { rows } = await query(`SELECT * FROM admission_batches WHERE is_active = true AND deleted_at IS NULL LIMIT 1`);
            batch = rows[0] || { id: 1, year_label: '2026', id_prefix: 'BB', id_offset: 0, id_separator: '-', id_digits: 4 };
        }

        // Generate or validate student_id_code
        let finalCode = '';
        if (student_id_code && String(student_id_code).trim()) {
            finalCode = String(student_id_code).trim().toUpperCase();
            // Check uniqueness
            const { rows: dupRows } = await query(`SELECT id FROM students WHERE UPPER(student_id_code) = $1 AND deleted_at IS NULL`, [finalCode]);
            if (dupRows.length > 0) {
                return res.status(400).json({ error: `Student ID "${finalCode}" is already in use.` });
            }
        } else {
            // Auto generate next ID in sequence
            const { rows: countRows } = await query(`SELECT COUNT(*) AS count FROM students WHERE admission_batch_id = $1 AND deleted_at IS NULL`, [batch.id]);
            const seq = parseInt(countRows[0].count) + 1;
            finalCode = formatStudentId(batch, seq);

            // Double check uniqueness
            let attempts = 0;
            while (attempts < 50) {
                const { rows: check } = await query(`SELECT id FROM students WHERE student_id_code = $1 AND deleted_at IS NULL`, [finalCode]);
                if (check.length === 0) break;
                attempts++;
                finalCode = formatStudentId(batch, seq + attempts);
            }
        }

        const { rows: maxRow } = await query(`SELECT MAX(id) AS "maxId" FROM students`);
        const newId = (maxRow[0] && maxRow[0].maxId) ? parseInt(maxRow[0].maxId) + 1 : 1;
        const targetYear = academic_year || batch.year_label || '2026';
        const targetStatus = status || 'Active';

        await query(
            `INSERT INTO students 
                (id, name, grade, enrollmentdate, birthdate, attendance, parentid, student_id_code, admission_batch_id, academic_year, status, remarks, deleted_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL)`,
            [newId, name, grade, enrollmentDate || null, birthDate || null, attendance || null, parentid || null, finalCode, batch.id, targetYear, targetStatus, remarks || null]
        );

        // Password handling
        const rawPassword = (password && String(password).trim()) ? String(password).trim() : 'bb' + finalCode.toLowerCase().replace(/[^a-z0-9]/g, '');
        const hash = await bcrypt.hash(rawPassword, 10);
        await query(
            `INSERT INTO student_auth (student_id, password_hash, plain_password, must_change)
             VALUES ($1, $2, $3, false)
             ON CONFLICT (student_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, plain_password = EXCLUDED.plain_password, last_changed = NOW()`,
            [newId, hash, rawPassword]
        );

        res.status(201).json({ 
            id: newId, 
            student_id_code: finalCode,
            bbId: finalCode,
            academic_year: targetYear,
            status: targetStatus,
            plainPassword: rawPassword 
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update student details
router.put('/:id', async (req, res) => {
    const { name, grade, enrollmentDate, birthDate, attendance, gpa, remarks, parentid, password, status, academic_year, student_id_code } = req.body;
    const studentId = parseInt(req.params.id);
    try {
        let cleanCode = null;
        if (student_id_code && String(student_id_code).trim()) {
            cleanCode = String(student_id_code).trim().toUpperCase();
            const { rows: dupCheck } = await query(`SELECT id FROM students WHERE UPPER(student_id_code) = $1 AND id != $2 AND deleted_at IS NULL`, [cleanCode, studentId]);
            if (dupCheck.length > 0) return res.status(400).json({ error: `Student ID "${cleanCode}" is already used by another student.` });
        }

        await query(
            `UPDATE students SET
                name = COALESCE($1, name),
                grade = COALESCE($2, grade),
                enrollmentdate = COALESCE($3, enrollmentdate),
                birthdate = COALESCE($4, birthdate),
                attendance = COALESCE($5, attendance),
                gpa = COALESCE($6, gpa),
                remarks = COALESCE($7, remarks),
                parentid = COALESCE($8, parentid),
                status = COALESCE($9, status),
                academic_year = COALESCE($10, academic_year),
                student_id_code = COALESCE($11, student_id_code)
             WHERE id = $12 AND deleted_at IS NULL`,
            [name, grade, enrollmentDate, birthDate, attendance, gpa, remarks, parentid || null, status, academic_year, cleanCode || null, studentId]
        );

        if (password && String(password).trim()) {
            const rawPassword = String(password).trim();
            const hash = await bcrypt.hash(rawPassword, 10);
            await query(
                `INSERT INTO student_auth (student_id, password_hash, plain_password, last_changed)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (student_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, plain_password = EXCLUDED.plain_password, last_changed = NOW()`,
                [studentId, hash, rawPassword]
            );
        }

        res.json({ message: 'Student updated successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update student status (e.g. Graduated, Alumni, Active)
router.put('/:id/status', async (req, res) => {
    const studentId = parseInt(req.params.id);
    const { status, remarks } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    try {
        await query(`
            UPDATE students 
            SET status = $1, remarks = COALESCE($2, remarks), updated_at = NOW() 
            WHERE id = $3 AND deleted_at IS NULL
        `, [status, remarks || null, studentId]);

        // If transitioning to Graduated or Alumni, optionally create a snapshot in student_academic_history
        if (status.toLowerCase() === 'graduated' || status.toLowerCase() === 'alumni') {
            const { rows: sRows } = await query(`SELECT * FROM students WHERE id = $1`, [studentId]);
            if (sRows[0]) {
                const s = sRows[0];
                await query(`
                    INSERT INTO student_academic_history 
                      (student_id, academic_year, class_id, grade, gpa, status_in_year, remarks)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [s.id, s.academic_year || '2026', s.classid, s.grade, s.gpa, status, remarks || 'Graduated / Alumni status recorded']);
            }
        }

        res.json({ message: `Student status updated to ${status}.` });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// GET /:id/password - Admin view student password
router.get('/:id/password', async (req, res) => {
    const studentId = parseInt(req.params.id);
    try {
        const { rows } = await query(
            `SELECT sa.plain_password, sa.last_changed, sa.must_change, s.name, s.id, s.student_id_code
             FROM student_auth sa
             JOIN students s ON s.id = sa.student_id
             WHERE s.id = $1 AND s.deleted_at IS NULL`,
            [studentId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Password record not found.' });
        res.json({
            id: rows[0].id,
            bbId: rows[0].student_id_code || makeBBId(rows[0].id),
            name: rows[0].name,
            plainPassword: rows[0].plain_password,
            lastChanged: rows[0].last_changed,
            mustChange: rows[0].must_change
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id/password - Admin reset student password
router.put('/:id/password', async (req, res) => {
    const studentId = parseInt(req.params.id);
    const { password } = req.body;
    if (!password || String(password).trim().length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }
    const rawPassword = String(password).trim();
    try {
        const hash = await bcrypt.hash(rawPassword, 10);
        await query(
            `INSERT INTO student_auth (student_id, password_hash, plain_password, must_change, last_changed)
             VALUES ($1, $2, $3, false, NOW())
             ON CONFLICT (student_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, plain_password = EXCLUDED.plain_password, must_change = false, last_changed = NOW()`,
            [studentId, hash, rawPassword]
        );
        res.json({ success: true, message: 'Password updated successfully.', plainPassword: rawPassword });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE soft-delete student to recycle bin
router.delete('/:id', async (req, res) => {
    try {
        await query(`UPDATE students SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'Student moved to Recycle Bin (records preserved).' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE all active students to recycle bin
router.delete('/', async (req, res) => {
    try {
        const { rowCount } = await query(`UPDATE students SET deleted_at = NOW() WHERE deleted_at IS NULL`);
        res.json({ message: `${rowCount} student(s) moved to Recycle Bin.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/template/download', (req, res) => {
    const csv = stringify([
        ['Name', 'Grade', 'EnrollmentDate', 'BirthDate', 'Password', 'AcademicYear'],
        ['John Doe', '12', '2026-01-15', '2008-05-20', 'bb260001', '2026'],
        ['Jane Smith', '11', '2026-01-15', '2009-08-12', 'bb260002', '2026']
    ]);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students-template.csv"');
    res.send(csv);
});

router.post('/upload-csv', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'CSV file is required.' });
    try {
        const content = req.file.buffer.toString('utf-8');
        const records = parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true });

        let imported = 0, errors = [];
        const { rows: maxRow } = await query(`SELECT MAX(id) AS "maxId" FROM students`);
        let nextId = (maxRow[0] && maxRow[0].maxId) ? parseInt(maxRow[0].maxId) + 1 : 1;

        const defaultBatch = (await query(`SELECT * FROM admission_batches WHERE is_active = true LIMIT 1`)).rows[0]
            || { id: 1, year_label: '2026', id_prefix: 'BB', id_offset: 0, id_separator: '-', id_digits: 4 };

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rk = Object.keys(row).reduce((acc, k) => { acc[k.toLowerCase().replace(/\(.*\)/g,'').trim()] = row[k]; return acc; }, {});
            const name = (rk['name'] || '').trim();
            const grade = (rk['grade'] || '').trim();
            const enrollmentDate = (rk['enrollmentdate'] || '').trim();
            const birthDate = (rk['birthdate'] || '').trim();
            const customPassword = (rk['password'] || '').trim();
            const academicYear = (rk['academicyear'] || defaultBatch.year_label).trim();

            if (!name || !grade) { errors.push(`Row ${i+2}: Name and Grade are required`); continue; }
            try {
                const sId = nextId++;
                const { rows: countRows } = await query(`SELECT COUNT(*) AS count FROM students WHERE admission_batch_id = $1 AND deleted_at IS NULL`, [defaultBatch.id]);
                const code = formatStudentId(defaultBatch, parseInt(countRows[0].count) + 1);

                await query(
                    `INSERT INTO students (id, name, grade, enrollmentdate, birthdate, student_id_code, admission_batch_id, academic_year, status) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Active')`,
                    [sId, name, grade, enrollmentDate || null, birthDate || null, code, defaultBatch.id, academicYear]
                );
                const pwd = customPassword || ('bb' + code.toLowerCase().replace(/[^a-z0-9]/g, ''));
                const hash = await bcrypt.hash(pwd, 10);
                await query(
                    `INSERT INTO student_auth (student_id, password_hash, plain_password) VALUES ($1, $2, $3)
                     ON CONFLICT (student_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, plain_password = EXCLUDED.plain_password`,
                    [sId, hash, pwd]
                );
                imported++;
            } catch (e) {
                errors.push(`Row ${i+2}: ${e.message}`);
            }
        }
        res.json({ message: `Imported ${imported} student(s).`, errors: errors.length > 0 ? errors : undefined });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
