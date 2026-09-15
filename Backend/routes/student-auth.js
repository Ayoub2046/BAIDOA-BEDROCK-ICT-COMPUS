// Backend/routes/student-auth.js
// Handles student login with BB Student ID + password
// Admin can create/view/reset student passwords
// Students can change their own password

const express = require('express');
const bcrypt = require('bcrypt');
const { query } = require('../database.js');
const router = express.Router();

// ---------------------------------------------------------------
// Helper: convert numeric student id → BB Student ID string
// BB260001 = BB + LPAD(260000 + id, 6, '0')
// ---------------------------------------------------------------
function makeBBId(id) {
    return 'BB' + String(260000 + parseInt(id)).padStart(6, '0');
}

// ---------------------------------------------------------------
// Helper: parse BB Student ID back to numeric id
// 'BB260001' -> 1
// ---------------------------------------------------------------
function parseBBId(bbId) {
    const str = String(bbId).trim().toUpperCase();
    const match = str.match(/^BB(\d+)$/);
    if (!match) return null;
    const num = parseInt(match[1]);
    if (isNaN(num) || num <= 260000) return null;
    return num - 260000;
}

// ---------------------------------------------------------------
// Helper: find student by any ID format (e.g. BB26-0001, BB260001, numeric ID, or legacy)
// ---------------------------------------------------------------
async function findStudentByIdOrCode(input) {
    const raw = String(input).trim();
    const cleanNoDash = raw.toUpperCase().replace(/-/g, '');
    const legacyNumeric = parseBBId(raw);

    const { rows } = await query(`
        SELECT s.id, s.name, s.grade, s.department, s.period, s.image, s.gpa, s.classid,
               s.student_id_code, s.status, s.academic_year,
               sa.password_hash, sa.must_change
        FROM students s
        JOIN student_auth sa ON sa.student_id = s.id
        WHERE s.deleted_at IS NULL
          AND (
            UPPER(s.student_id_code) = UPPER($1)
            OR UPPER(REPLACE(s.student_id_code, '-', '')) = $2
            OR s.id = $3
            OR ($4::int IS NOT NULL AND s.id = $4)
          )
        LIMIT 1
    `, [raw, cleanNoDash, parseInt(raw) || -1, legacyNumeric || null]);

    return rows[0] || null;
}

// ---------------------------------------------------------------
// POST /api/student-auth/login
// Body: { bbId: 'BB26-0001' or 'BB260001', password: '...' }
// Returns student dashboard data on success
// ---------------------------------------------------------------
router.post('/login', async (req, res) => {
    const { bbId, password } = req.body;
    if (!bbId || !password) {
        return res.status(400).json({ error: 'Student ID and password are required.' });
    }

    try {
        const student = await findStudentByIdOrCode(bbId);
        if (!student) {
            return res.status(401).json({ error: 'Invalid Student ID or password.' });
        }

        if (student.status && student.status.toLowerCase() === 'inactive') {
            return res.status(403).json({ error: 'Your account is currently inactive. Please contact school administration.' });
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, student.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid Student ID or password.' });
        }

        const isAlumni = (student.status && (student.status.toLowerCase() === 'graduated' || student.status.toLowerCase() === 'alumni'));
        const displayId = student.student_id_code || makeBBId(student.id);

        return res.json({
            success: true,
            mustChange: student.must_change,
            student: {
                id: student.id,
                bbId: displayId,
                student_id_code: displayId,
                name: student.name,
                grade: student.grade,
                department: student.department,
                period: student.period,
                image: student.image,
                gpa: student.gpa,
                classid: student.classid,
                status: student.status || 'Active',
                academic_year: student.academic_year || '2026',
                isAlumni,
                role: isAlumni ? 'Alumni' : 'Student'
            }
        });
    } catch (err) {
        console.error('Student login error:', err.message);
        return res.status(500).json({ error: 'Server error during login.' });
    }
});

// ---------------------------------------------------------------
// PUT /api/student-auth/change-password
// Body: { studentId: 1, oldPassword: '...', newPassword: '...' }
// Student changes their own password (must know old password)
// ---------------------------------------------------------------
router.put('/change-password', async (req, res) => {
    const { studentId, bbId, oldPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: 'New password must be at least 4 characters.' });
    }

    let id = studentId;
    if (!id && bbId) {
        id = parseBBId(bbId);
    }
    if (!id) return res.status(400).json({ error: 'Student ID is required.' });

    try {
        const { rows } = await query(
            `SELECT password_hash FROM student_auth WHERE student_id = $1`,
            [id]
        );
        const auth = rows[0];
        if (!auth) return res.status(404).json({ error: 'Student account not found.' });

        // Verify old password
        const match = await bcrypt.compare(oldPassword, auth.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await query(
            `UPDATE student_auth
             SET password_hash = $1, plain_password = $2, must_change = false, last_changed = NOW()
             WHERE student_id = $3`,
            [newHash, newPassword, id]
        );

        return res.json({ success: true, message: 'Password changed successfully.' });
    } catch (err) {
        console.error('Change password error:', err.message);
        return res.status(500).json({ error: 'Server error.' });
    }
});

// ---------------------------------------------------------------
// GET /api/student-auth/view-password/:studentId
// ADMIN ONLY — returns the plain password so admin can tell student
// ---------------------------------------------------------------
router.get('/view-password/:studentId', async (req, res) => {
    const { studentId } = req.params;
    try {
        const { rows } = await query(
            `SELECT sa.plain_password, sa.last_changed, sa.must_change,
                    s.name, s.id, bb_student_id(s.id) AS bb_id
             FROM student_auth sa
             JOIN students s ON s.id = sa.student_id
             WHERE sa.student_id = $1 AND s.deleted_at IS NULL`,
            [studentId]
        );
        const record = rows[0];
        if (!record) return res.status(404).json({ error: 'Student not found.' });

        return res.json({
            studentId: record.id,
            bbId: record.bb_id,
            name: record.name,
            plainPassword: record.plain_password,
            lastChanged: record.last_changed,
            mustChange: record.must_change
        });
    } catch (err) {
        console.error('View password error:', err.message);
        return res.status(500).json({ error: 'Server error.' });
    }
});

// ---------------------------------------------------------------
// PUT /api/student-auth/admin-reset/:studentId
// ADMIN — reset a student's password
// Body: { newPassword: '...' }
// ---------------------------------------------------------------
router.put('/admin-reset/:studentId', async (req, res) => {
    const { studentId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: 'New password must be at least 4 characters.' });
    }

    try {
        const newHash = await bcrypt.hash(newPassword, 10);
        const { rowCount } = await query(
            `UPDATE student_auth
             SET password_hash = $1, plain_password = $2, must_change = true, last_changed = NOW()
             WHERE student_id = $3`,
            [newHash, newPassword, studentId]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Student account not found.' });

        return res.json({ success: true, message: 'Student password has been reset.' });
    } catch (err) {
        console.error('Admin reset error:', err.message);
        return res.status(500).json({ error: 'Server error.' });
    }
});

// ---------------------------------------------------------------
// GET /api/student-auth/lookup/:bbId
// Look up a student by their BB ID (for login page convenience)
// ---------------------------------------------------------------
router.get('/lookup/:bbId', async (req, res) => {
    const id = parseBBId(req.params.bbId);
    if (!id) return res.status(400).json({ error: 'Invalid BB Student ID.' });

    try {
        const { rows } = await query(
            `SELECT s.id, s.name, s.image, s.grade, bb_student_id(s.id) AS bb_id
             FROM students s WHERE s.id = $1 AND s.deleted_at IS NULL`,
            [id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Student not found.' });
        return res.json(rows[0]);
    } catch (err) {
        return res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
