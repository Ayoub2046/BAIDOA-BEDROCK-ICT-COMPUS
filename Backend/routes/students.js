const express = require('express');
const multer = require('multer');
const bcrypt = require('bcrypt');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { query } = require('../database.js');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

function makeBBId(id) {
    return 'BB' + String(260000 + parseInt(id)).padStart(6, '0');
}

// GET all students (including bb_id and admin-visible password from student_auth)
router.get('/', async (req, res) => {
    try {
        const { rows } = await query(
            `SELECT s.*, 
                    u.name AS parent_name,
                    COALESCE(sa.plain_password, '') AS plain_password,
                    sa.must_change,
                    sa.last_changed
             FROM students s 
             LEFT JOIN users u ON u.id = s.parentid 
             LEFT JOIN student_auth sa ON sa.student_id = s.id
             WHERE s.deleted_at IS NULL 
             ORDER BY s.id`
        );
        const mapped = rows.map(s => ({
            ...s,
            bb_id: makeBBId(s.id),
            bbId: makeBBId(s.id)
        }));
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create new student with admin-specified or default password
router.post('/', async (req, res) => {
    const { name, grade, enrollmentDate, birthDate, attendance, parentid, password } = req.body;
    try {
        const { rows: maxRow } = await query(`SELECT MAX(id) AS "maxId" FROM students`);
        const newId = (maxRow[0] && maxRow[0].maxId) ? parseInt(maxRow[0].maxId) + 1 : 1;
        await query(
            `INSERT INTO students (id, name, grade, enrollmentdate, birthdate, attendance, parentid, deleted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)`,
            [newId, name, grade, enrollmentDate || null, birthDate || null, attendance || null, parentid || null]
        );

        // Password handling: admin set password or default
        const rawPassword = (password && String(password).trim()) ? String(password).trim() : 'bb' + (260000 + newId);
        const hash = await bcrypt.hash(rawPassword, 10);
        await query(
            `INSERT INTO student_auth (student_id, password_hash, plain_password, must_change)
             VALUES ($1, $2, $3, false)
             ON CONFLICT (student_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, plain_password = EXCLUDED.plain_password, last_changed = NOW()`,
            [newId, hash, rawPassword]
        );

        res.status(201).json({ 
            id: newId, 
            bbId: makeBBId(newId),
            plainPassword: rawPassword 
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT update student details and optionally change/reset password
router.put('/:id', async (req, res) => {
    const { name, grade, enrollmentDate, birthDate, attendance, gpa, remarks, parentid, password } = req.body;
    const studentId = parseInt(req.params.id);
    try {
        await query(
            `UPDATE students SET
                name = COALESCE($1, name),
                grade = COALESCE($2, grade),
                enrollmentdate = COALESCE($3, enrollmentdate),
                birthdate = COALESCE($4, birthdate),
                attendance = COALESCE($5, attendance),
                gpa = COALESCE($6, gpa),
                remarks = COALESCE($7, remarks),
                parentid = COALESCE($8, parentid)
             WHERE id = $9 AND deleted_at IS NULL`,
            [name, grade, enrollmentDate, birthDate, attendance, gpa, remarks, parentid || null, studentId]
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

        res.json({ message: 'success' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// GET /:id/password - Admin view student password
router.get('/:id/password', async (req, res) => {
    const studentId = parseInt(req.params.id);
    try {
        const { rows } = await query(
            `SELECT sa.plain_password, sa.last_changed, sa.must_change, s.name, s.id
             FROM student_auth sa
             JOIN students s ON s.id = sa.student_id
             WHERE s.id = $1 AND s.deleted_at IS NULL`,
            [studentId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Password record not found.' });
        res.json({
            id: rows[0].id,
            bbId: makeBBId(rows[0].id),
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

// DELETE all active students (soft-delete to recycle bin)
router.delete('/', async (req, res) => {
    try {
        const { rowCount } = await query(`UPDATE students SET deleted_at = NOW() WHERE deleted_at IS NULL`);
        res.json({ message: `${rowCount} student(s) moved to Recycle Bin.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE hard all students permanently
router.delete('/hard/all', async (req, res) => {
    try {
        const { rowCount } = await query(`DELETE FROM students`);
        res.json({ message: `${rowCount} student(s) permanently deleted.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await query(`UPDATE students SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
        res.json({ message: 'deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/hard/:id', async (req, res) => {
    try {
        await query(`DELETE FROM students WHERE id = $1`, [req.params.id]);
        res.json({ message: 'permanently deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/template/download', (req, res) => {
    const csv = stringify([
        ['Name', 'Grade', 'EnrollmentDate', 'BirthDate', 'Password'],
        ['John Doe', '12', '2026-01-15', '2008-05-20', 'bb260001'],
        ['Jane Smith', '11', '2026-01-15', '2009-08-12', 'bb260002']
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

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rk = Object.keys(row).reduce((acc, k) => { acc[k.toLowerCase().replace(/\(.*\)/g,'').trim()] = row[k]; return acc; }, {});
            const name = (rk['name'] || '').trim();
            const grade = (rk['grade'] || '').trim();
            const enrollmentDate = (rk['enrollmentdate'] || '').trim();
            const birthDate = (rk['birthdate'] || '').trim();
            const customPassword = (rk['password'] || '').trim();

            if (!name || !grade) { errors.push(`Row ${i+2}: Name and Grade are required`); continue; }
            try {
                const sId = nextId++;
                await query(
                    `INSERT INTO students (id, name, grade, enrollmentdate, birthdate) VALUES ($1, $2, $3, $4, $5)`,
                    [sId, name, grade, enrollmentDate || null, birthDate || null]
                );
                const pwd = customPassword || ('bb' + (260000 + sId));
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
