// Backend/routes/exam-attendance.js
const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

/**
 * GET /api/exam-attendance
 * Filter exam attendance records by class, period, academic year, subject, status, search, and teacher
 */
router.get('/', async (req, res) => {
  try {
    const classId = req.query.classId || req.query.class_id ? parseInt(req.query.classId || req.query.class_id) : null;
    const periodId = req.query.periodId || req.query.period_id ? parseInt(req.query.periodId || req.query.period_id) : null;
    const academicYear = req.query.academic_year || req.query.academicYear || null;
    const subject = req.query.subject ? req.query.subject.trim() : null;
    const status = req.query.status ? req.query.status.trim() : null;
    const search = req.query.search ? req.query.search.trim().toLowerCase() : null;
    const teacherId = req.query.teacherId ? parseInt(req.query.teacherId) : null;

    let sql = `
      SELECT ea.id, ea.student_id, ea.academic_year, ea.class_id, ea.period_id, ea.subject,
             ea.status, ea.notes, ea.recorded_by, ea.created_at, ea.updated_at,
             s.name AS student_name, s.student_id_code, s.grade, s.status AS student_status,
             c.name AS class_name,
             ep.name AS period_name, ep.year AS period_year, ep.month AS period_month
      FROM exam_attendance ea
      JOIN students s ON s.id = ea.student_id
      LEFT JOIN classes c ON c.id = ea.class_id OR c.id = s.classid
      LEFT JOIN exam_periods ep ON ep.id = ea.period_id
      WHERE s.deleted_at IS NULL
    `;
    const params = [];
    let idx = 1;

    if (classId && !isNaN(classId)) {
      sql += ` AND (ea.class_id = $${idx} OR s.classid = $${idx})`;
      params.push(classId);
      idx++;
    }

    if (periodId && !isNaN(periodId)) {
      sql += ` AND ea.period_id = $${idx++}`;
      params.push(periodId);
    }

    if (academicYear && academicYear !== 'all') {
      sql += ` AND (ea.academic_year = $${idx} OR ep.academic_year = $${idx} OR ep.year = CAST($${idx} AS INT))`;
      params.push(academicYear);
      idx++;
    }

    if (subject && subject !== 'all') {
      sql += ` AND LOWER(ea.subject) = LOWER($${idx++})`;
      params.push(subject);
    }

    if (status && status !== 'all') {
      if (status === 'did_not_attend_all') {
        // Group all non-attended statuses
        sql += ` AND ea.status IN ('did_not_attend', 'absent', 'excused', 'makeup_pending')`;
      } else {
        sql += ` AND ea.status = $${idx++}`;
        params.push(status);
      }
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

    sql += ` ORDER BY ea.class_id ASC, s.name ASC, ea.id DESC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching exam attendance:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/exam-attendance/stats
 * Return overall or filtered attendance statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const classId = req.query.classId || req.query.class_id ? parseInt(req.query.classId || req.query.class_id) : null;
    const periodId = req.query.periodId || req.query.period_id ? parseInt(req.query.periodId || req.query.period_id) : null;
    const academicYear = req.query.academic_year || req.query.academicYear || null;
    const subject = req.query.subject ? req.query.subject.trim() : null;

    let studentFilter = 'WHERE s.deleted_at IS NULL';
    const studentParams = [];
    if (classId && !isNaN(classId)) {
      studentFilter += ` AND s.classid = $1`;
      studentParams.push(classId);
    }

    const { rows: totalRows } = await query(`
      SELECT COUNT(DISTINCT s.id)::int AS total
      FROM students s
      ${studentFilter}
    `, studentParams);

    const totalStudents = totalRows[0] ? totalRows[0].total : 0;

    let attSql = `
      SELECT ea.status, COUNT(DISTINCT ea.student_id)::int AS count
      FROM exam_attendance ea
      JOIN students s ON s.id = ea.student_id
      WHERE s.deleted_at IS NULL
    `;
    const attParams = [];
    let idx = 1;

    if (classId && !isNaN(classId)) {
      attSql += ` AND (ea.class_id = $${idx} OR s.classid = $${idx})`;
      attParams.push(classId);
      idx++;
    }
    if (periodId && !isNaN(periodId)) {
      attSql += ` AND ea.period_id = $${idx++}`;
      attParams.push(periodId);
    }
    if (subject && subject !== 'all') {
      attSql += ` AND LOWER(ea.subject) = LOWER($${idx++})`;
      attParams.push(subject);
    }

    attSql += ` GROUP BY ea.status`;

    const { rows: attRows } = await query(attSql, attParams);

    let attended = 0;
    let absent = 0;
    let excused = 0;
    let makeupPending = 0;
    let didNotAttend = 0;

    attRows.forEach(r => {
      const c = parseInt(r.count) || 0;
      if (r.status === 'attended') attended += c;
      else {
        didNotAttend += c;
        if (r.status === 'absent') absent += c;
        else if (r.status === 'excused') excused += c;
        else if (r.status === 'makeup_pending') makeupPending += c;
      }
    });

    // If total students > sum of recorded, remaining are unrecorded absence
    const recordedTotal = attended + didNotAttend;
    if (totalStudents > recordedTotal) {
      didNotAttend += (totalStudents - recordedTotal);
    }

    res.json({
      totalStudents,
      attended,
      didNotAttend,
      breakdown: {
        attended,
        didNotAttend,
        absent,
        excused,
        makeupPending
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/exam-attendance/mark
 * Mark or update attendance status for a student
 */
router.post('/mark', async (req, res) => {
  try {
    const { studentId, classId, periodId, subject, academicYear, status, notes, recordedBy } = req.body;
    if (!studentId || !subject) {
      return res.status(400).json({ error: 'studentId and subject are required.' });
    }

    const validStatuses = ['attended', 'did_not_attend', 'absent', 'excused', 'makeup_pending'];
    const chosenStatus = validStatuses.includes(status) ? status : 'did_not_attend';
    const year = academicYear || '2026';
    const pid = periodId ? parseInt(periodId) : null;
    const cid = classId ? parseInt(classId) : null;

    // Upsert into exam_attendance
    const { rows } = await query(`
      INSERT INTO exam_attendance (student_id, academic_year, class_id, period_id, subject, status, notes, recorded_by, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (student_id, COALESCE(period_id, 0), LOWER(subject), COALESCE(class_id, 0))
      DO UPDATE SET
        status = EXCLUDED.status,
        notes = COALESCE(EXCLUDED.notes, exam_attendance.notes),
        recorded_by = COALESCE(EXCLUDED.recorded_by, exam_attendance.recorded_by),
        updated_at = NOW()
      RETURNING *
    `, [studentId, year, cid, pid, subject, chosenStatus, notes || null, recordedBy || 'Admin']);

    // If marked as did_not_attend, absent, excused, or makeup_pending, soft delete any results for this exam
    if (chosenStatus !== 'attended') {
      await query(`
        UPDATE results
        SET deleted_at = NOW()
        WHERE student_id = $1
          AND LOWER(subject) = LOWER($2)
          AND ($3::INTEGER IS NULL OR period_id = $3)
          AND deleted_at IS NULL
      `, [studentId, subject, pid]);
    }

    res.json({ success: true, record: rows[0] });
  } catch (err) {
    console.error('Error marking exam attendance:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/exam-attendance/schedule-makeup
 * Schedule a makeup exam for an absent student
 */
router.post('/schedule-makeup', async (req, res) => {
  try {
    const { studentId, periodId, classId, subject, makeupDate, notes, recordedBy } = req.body;
    if (!studentId || !subject) {
      return res.status(400).json({ error: 'studentId and subject are required.' });
    }

    const noteText = `Makeup scheduled for: ${makeupDate || 'Pending date'}${notes ? ' - ' + notes : ''}`;

    const { rows } = await query(`
      INSERT INTO exam_attendance (student_id, academic_year, class_id, period_id, subject, status, notes, recorded_by, updated_at)
      VALUES ($1, '2026', $2, $3, $4, 'makeup_pending', $5, $6, NOW())
      ON CONFLICT (student_id, COALESCE(period_id, 0), LOWER(subject), COALESCE(class_id, 0))
      DO UPDATE SET
        status = 'makeup_pending',
        notes = $5,
        recorded_by = COALESCE(EXCLUDED.recorded_by, exam_attendance.recorded_by),
        updated_at = NOW()
      RETURNING *
    `, [studentId, classId ? parseInt(classId) : null, periodId ? parseInt(periodId) : null, subject, noteText, recordedBy || 'Admin']);

    res.json({ success: true, record: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
