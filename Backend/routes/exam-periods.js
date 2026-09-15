// Backend/routes/exam-periods.js
// Monthly/Yearly exam period management, results archiving & performance analytics

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// GET all exam periods (optionally filter by year, period_type, class_id)
router.get('/', async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : null;
    const type = req.query.type ? req.query.type.trim() : null;
    const classId = req.query.class_id ? parseInt(req.query.class_id) : null;
    const isArchived = req.query.archived !== undefined ? req.query.archived === 'true' : false;

    let sql = `
      SELECT ep.*,
        c.name AS class_name,
        (SELECT COUNT(*) FROM results r WHERE r.period_id = ep.id AND r.deleted_at IS NULL) AS result_count,
        (SELECT COUNT(DISTINCT r.student_id) FROM results r WHERE r.period_id = ep.id AND r.deleted_at IS NULL) AS student_count
      FROM exam_periods ep
      LEFT JOIN classes c ON c.id = ep.class_id
      WHERE ep.deleted_at IS NULL AND ep.is_archived = $1
    `;
    const params = [isArchived];
    let idx = 2;

    if (year) { sql += ` AND ep.year = $${idx++}`; params.push(year); }
    if (type) { sql += ` AND LOWER(ep.period_type) = LOWER($${idx++})`; params.push(type); }
    if (classId) { sql += ` AND (ep.class_id = $${idx} OR ep.class_id IS NULL)`; params.push(classId); idx++; }

    sql += ` ORDER BY ep.year DESC, ep.month ASC NULLS LAST, ep.id DESC`;
    const { rows } = await query(sql, params);

    rows.forEach(r => {
      r.month_name = r.month ? MONTHS[r.month - 1] : null;
      r.label = r.name || r.label;
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET dedicated examination archive with multi-criteria search & filtering
router.get('/archive', async (req, res) => {
  try {
    const { year, month, type, class_id, subject, search } = req.query;
    let sql = `
      SELECT r.id AS result_id, r.student_id, r.subject, r.score, r.max_score, r.exam_type,
             r.approval_status, r.academic_year, r.submitted_at,
             s.name AS student_name, s.student_id_code, s.grade, s.status AS student_status,
             c.name AS class_name, c.id AS class_id,
             ep.id AS period_id, ep.name AS period_name, ep.period_type, ep.year, ep.month, ep.is_locked
      FROM results r
      JOIN students s ON s.id = r.student_id
      LEFT JOIN classes c ON c.id = r.classid
      LEFT JOIN exam_periods ep ON ep.id = r.period_id
      WHERE r.deleted_at IS NULL AND (ep.is_archived = true OR r.approval_status = 'approved')
    `;
    const params = [];
    let idx = 1;

    if (year && year !== 'all') {
      sql += ` AND (ep.year = $${idx} OR r.academic_year = CAST($${idx} AS TEXT))`;
      params.push(parseInt(year));
      idx++;
    }
    if (month && month !== 'all') {
      sql += ` AND ep.month = $${idx++}`;
      params.push(parseInt(month));
    }
    if (type && type !== 'all') {
      sql += ` AND (LOWER(ep.period_type) = LOWER($${idx}) OR LOWER(r.exam_type) = LOWER($${idx}))`;
      params.push(type);
      idx++;
    }
    if (class_id && class_id !== 'all') {
      sql += ` AND (r.classid = $${idx} OR ep.class_id = $${idx})`;
      params.push(parseInt(class_id));
      idx++;
    }
    if (subject && subject !== 'all') {
      sql += ` AND LOWER(r.subject) = LOWER($${idx++})`;
      params.push(subject);
    }
    if (search && search.trim()) {
      sql += ` AND (s.name ILIKE $${idx} OR s.student_id_code ILIKE $${idx} OR ep.name ILIKE $${idx} OR r.subject ILIKE $${idx})`;
      params.push(`%${search.trim()}%`);
      idx++;
    }

    sql += ` ORDER BY r.academic_year DESC, ep.month DESC NULLS LAST, r.id DESC LIMIT 200`;
    const { rows } = await query(sql, params);

    rows.forEach(r => {
      r.month_name = r.month ? MONTHS[r.month - 1] : null;
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET distinct years that have exam periods
router.get('/years', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT DISTINCT year FROM exam_periods WHERE deleted_at IS NULL ORDER BY year DESC
    `);
    res.json(rows.map(r => r.year));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET performance statistics for an exam period
router.get('/:id/performance', async (req, res) => {
  try {
    const periodId = parseInt(req.params.id);
    const { rows: pRows } = await query(`SELECT * FROM exam_periods WHERE id = $1 AND deleted_at IS NULL`, [periodId]);
    if (!pRows[0]) return res.status(404).json({ error: 'Exam period not found' });
    const period = pRows[0];

    // Summary query
    const { rows: statsRows } = await query(`
      SELECT 
        COUNT(DISTINCT r.student_id) AS total_students,
        COUNT(r.id) AS total_entries,
        ROUND(AVG(r.score), 2) AS average_score,
        MAX(r.score) AS highest_score,
        MIN(r.score) AS lowest_score
      FROM results r
      WHERE r.period_id = $1 AND r.deleted_at IS NULL
    `, [periodId]);

    // Student rankings
    const { rows: studentRanks } = await query(`
      SELECT s.id, s.name, s.student_id_code, c.name AS class_name,
             ROUND(AVG(r.score), 2) AS student_avg,
             SUM(r.score) AS total_score,
             COUNT(r.id) AS subjects_count
      FROM results r
      JOIN students s ON s.id = r.student_id
      LEFT JOIN classes c ON c.id = r.classid
      WHERE r.period_id = $1 AND r.deleted_at IS NULL
      GROUP BY s.id, s.name, s.student_id_code, c.name
      ORDER BY total_score DESC
      LIMIT 50
    `, [periodId]);

    res.json({
      period,
      stats: statsRows[0] || {},
      rankings: studentRanks
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single exam period
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT ep.*, c.name AS class_name,
        (SELECT COUNT(DISTINCT r.student_id) FROM results r WHERE r.period_id = ep.id AND r.deleted_at IS NULL) AS student_count,
        (SELECT COUNT(*) FROM results r WHERE r.period_id = ep.id AND r.deleted_at IS NULL) AS result_count
      FROM exam_periods ep 
      LEFT JOIN classes c ON c.id = ep.class_id
      WHERE ep.id = $1 AND ep.deleted_at IS NULL
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Exam period not found' });
    const p = rows[0];
    p.month_name = p.month ? MONTHS[p.month - 1] : null;
    p.label = p.name || p.label;
    res.json(p);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create a new exam period (monthly, annual, mid_year, final, custom)
router.post('/', async (req, res) => {
  const name = req.body.name || req.body.label;
  const { year, month, period_type, academic_year, class_id, exam_date } = req.body;
  if (!name || !year) {
    return res.status(400).json({ error: 'name and year are required' });
  }
  const monthNum = month ? parseInt(month) : null;
  if (monthNum && (monthNum < 1 || monthNum > 12)) {
    return res.status(400).json({ error: 'month must be 1-12' });
  }
  const type = period_type || (monthNum ? 'monthly' : 'annual');
  const finalYear = parseInt(year);
  const acadYear = academic_year || String(finalYear);

  try {
    const finalName = name.trim() || (monthNum ? MONTHS[monthNum-1] + ' Examination ' + finalYear : 'Annual Examination ' + finalYear);
    const { rows } = await query(`
      INSERT INTO exam_periods 
        (name, year, month, period_type, academic_year, class_id, exam_date, is_active, is_archived, is_locked, is_published)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, false, false, true)
      RETURNING *
    `, [finalName, finalYear, monthNum, type, acadYear, class_id ? parseInt(class_id) : null, exam_date || null]);
    const p = rows[0];
    p.month_name = p.month ? MONTHS[p.month - 1] : null;
    p.label = p.name;
    res.status(201).json(p);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update exam period
router.put('/:id', async (req, res) => {
  const { name, year, month, period_type, academic_year, class_id, exam_date, is_active, is_archived, is_locked, is_published } = req.body;
  try {
    const sets = [];
    const vals = [];
    let idx = 1;
    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name); }
    if (year !== undefined) { sets.push(`year = $${idx++}`); vals.push(parseInt(year)); }
    if (month !== undefined) { sets.push(`month = $${idx++}`); vals.push(month ? parseInt(month) : null); }
    if (period_type !== undefined) { sets.push(`period_type = $${idx++}`); vals.push(period_type); }
    if (academic_year !== undefined) { sets.push(`academic_year = $${idx++}`); vals.push(academic_year); }
    if (class_id !== undefined) { sets.push(`class_id = $${idx++}`); vals.push(class_id ? parseInt(class_id) : null); }
    if (exam_date !== undefined) { sets.push(`exam_date = $${idx++}`); vals.push(exam_date || null); }
    if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); vals.push(Boolean(is_active)); }
    if (is_archived !== undefined) { sets.push(`is_archived = $${idx++}`); vals.push(Boolean(is_archived)); }
    if (is_locked !== undefined) { sets.push(`is_locked = $${idx++}`); vals.push(Boolean(is_locked)); }
    if (is_published !== undefined) { sets.push(`is_published = $${idx++}`); vals.push(Boolean(is_published)); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.id);
    await query(`UPDATE exam_periods SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    res.json({ message: 'Exam period updated successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT lock finalized examination (makes marks read-only)
router.put('/:id/lock', async (req, res) => {
  try {
    await query(`UPDATE exam_periods SET is_locked = true WHERE id = $1`, [req.params.id]);
    await query(`UPDATE results SET is_locked = true WHERE period_id = $1`, [req.params.id]);
    res.json({ message: 'Examination finalized and locked. Results are now read-only.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT unlock examination
router.put('/:id/unlock', async (req, res) => {
  try {
    await query(`UPDATE exam_periods SET is_locked = false WHERE id = $1`, [req.params.id]);
    await query(`UPDATE results SET is_locked = false WHERE period_id = $1`, [req.params.id]);
    res.json({ message: 'Examination unlocked for editing.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT publish/unpublish examination
router.put('/:id/publish', async (req, res) => {
  try {
    await query(`UPDATE exam_periods SET is_published = true WHERE id = $1`, [req.params.id]);
    await query(`UPDATE results SET approval_status = 'approved' WHERE period_id = $1 AND approval_status != 'rejected'`, [req.params.id]);
    res.json({ message: 'Examination results published for student viewing.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/unpublish', async (req, res) => {
  try {
    await query(`UPDATE exam_periods SET is_published = false WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Examination results unpublished from student viewing.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT archive a period (preserving all records read-only)
router.put('/:id/archive', async (req, res) => {
  try {
    await query(`UPDATE exam_periods SET is_archived = true, is_active = false, is_locked = true WHERE id = $1`, [req.params.id]);
    await query(`UPDATE results SET is_locked = true WHERE period_id = $1`, [req.params.id]);
    res.json({ message: 'Exam period archived safely in the Examination Archive.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT unarchive/restore a period
router.put('/:id/unarchive', async (req, res) => {
  try {
    await query(`UPDATE exam_periods SET is_archived = false, is_active = true WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Exam period restored from archive.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE (soft delete) an exam period
router.delete('/:id', async (req, res) => {
  try {
    const { rows: check } = await query(`SELECT COUNT(*) AS cnt FROM results WHERE period_id = $1 AND deleted_at IS NULL`, [req.params.id]);
    if (parseInt(check[0].cnt) > 0) {
      return res.status(400).json({ error: 'Cannot delete period: it contains student results. Please archive it instead.' });
    }
    await query(`UPDATE exam_periods SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Exam period deleted.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET results for a student in a specific period
router.get('/:id/student/:studentId', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT r.id, r.subject, r.exam_type, r.score, r.max_score, r.remarks, r.approval_status,
             e.name AS exam_name, r.submitted_at
      FROM results r
      LEFT JOIN exams e ON e.exam_key = r.exam_type AND e.deleted_at IS NULL
      WHERE r.period_id = $1 AND r.student_id = $2 AND r.deleted_at IS NULL AND r.approval_status = 'approved'
      ORDER BY r.subject, r.submitted_at
    `, [req.params.id, req.params.studentId]);
    
    const grouped = {};
    rows.forEach(r => {
      if (!grouped[r.subject]) grouped[r.subject] = { scores: {}, maxScores: {}, total: 0, maxTotal: 0 };
      const score = parseFloat(r.score) || 0;
      const maxScore = parseFloat(r.max_score) || 0;
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

module.exports = router;
