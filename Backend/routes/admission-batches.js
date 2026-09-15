// Backend/routes/admission-batches.js
// Year-based admission batches with customizable student ID prefix & format

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

function formatStudentId(batch, sequenceNum) {
  const prefix = batch.id_prefix || 'BB';
  const yearShort = String(batch.year_label || '26').slice(-2);
  const sep = batch.id_separator !== undefined ? batch.id_separator : '-';
  const digits = parseInt(batch.id_digits) || 4;
  const offset = parseInt(batch.id_offset) || 0;
  const numPart = String(offset + sequenceNum).padStart(digits, '0');
  return `${prefix}${yearShort}${sep}${numPart}`;
}

// GET all admission batches (with student counts)
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT b.*,
        (SELECT COUNT(*) FROM students s WHERE s.admission_batch_id = b.id AND s.deleted_at IS NULL) AS student_count
      FROM admission_batches b
      WHERE b.deleted_at IS NULL
      ORDER BY b.year_label DESC, b.id DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET active batch
router.get('/active', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT * FROM admission_batches
      WHERE is_active = true AND deleted_at IS NULL
      ORDER BY id DESC LIMIT 1
    `);
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET preview of student IDs for a batch
router.get('/:id/preview', async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM admission_batches WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Batch not found' });
    const b = rows[0];
    const examples = [1, 2, 3, 10, 50].map(n => formatStudentId(b, n));
    res.json({ batch: b, examples });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET next available student ID for a batch
router.get('/:id/next-id', async (req, res) => {
  try {
    const { rows: batchRows } = await query(`SELECT * FROM admission_batches WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
    if (!batchRows[0]) return res.status(404).json({ error: 'Batch not found' });
    const batch = batchRows[0];

    // Count existing students in this batch to determine next sequence number
    const { rows: countRows } = await query(`
      SELECT COUNT(*) AS count FROM students 
      WHERE admission_batch_id = $1 AND deleted_at IS NULL
    `, [batch.id]);
    const nextSeq = parseInt(countRows[0].count) + 1;
    const nextId = formatStudentId(batch, nextSeq);
    res.json({ nextId, sequence: nextSeq });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all students belonging to an admission batch
router.get('/:id/students', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT s.*, c.name AS class_name 
      FROM students s
      LEFT JOIN classes c ON c.id = s.classid
      WHERE s.admission_batch_id = $1 AND s.deleted_at IS NULL
      ORDER BY s.id ASC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create a new admission batch
router.post('/', async (req, res) => {
  const { year_label, id_prefix, id_offset, id_separator, id_digits, generation_mode, description, start_date, end_date } = req.body;
  if (!year_label || !id_prefix) {
    return res.status(400).json({ error: 'year_label and id_prefix are required' });
  }
  const cleanPrefix = String(id_prefix).trim().toUpperCase();
  const offset = parseInt(id_offset) || 0;
  const digits = parseInt(id_digits) || 4;
  const sep = id_separator !== undefined ? String(id_separator) : '-';
  const genMode = generation_mode === 'manual' ? 'manual' : 'auto';

  try {
    const { rows } = await query(`
      INSERT INTO admission_batches 
        (year_label, id_prefix, id_offset, id_separator, id_digits, generation_mode, description, is_active, is_archived, start_date, end_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, false, false, $8, $9)
      RETURNING *
    `, [year_label, cleanPrefix, offset, sep, digits, genMode, description || null, start_date || null, end_date || null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update a batch
router.put('/:id', async (req, res) => {
  const { year_label, id_prefix, id_offset, id_separator, id_digits, generation_mode, description, start_date, end_date, is_active, is_archived } = req.body;
  try {
    const sets = [];
    const vals = [];
    let idx = 1;
    if (year_label !== undefined) { sets.push(`year_label = $${idx++}`); vals.push(year_label); }
    if (id_prefix !== undefined) { sets.push(`id_prefix = $${idx++}`); vals.push(String(id_prefix).trim().toUpperCase()); }
    if (id_offset !== undefined) { sets.push(`id_offset = $${idx++}`); vals.push(parseInt(id_offset) || 0); }
    if (id_separator !== undefined) { sets.push(`id_separator = $${idx++}`); vals.push(String(id_separator)); }
    if (id_digits !== undefined) { sets.push(`id_digits = $${idx++}`); vals.push(parseInt(id_digits) || 4); }
    if (generation_mode !== undefined) { sets.push(`generation_mode = $${idx++}`); vals.push(generation_mode); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
    if (start_date !== undefined) { sets.push(`start_date = $${idx++}`); vals.push(start_date || null); }
    if (end_date !== undefined) { sets.push(`end_date = $${idx++}`); vals.push(end_date || null); }
    if (is_active !== undefined) { sets.push(`is_active = $${idx++}`); vals.push(Boolean(is_active)); }
    if (is_archived !== undefined) { sets.push(`is_archived = $${idx++}`); vals.push(Boolean(is_archived)); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.id);
    await query(`UPDATE admission_batches SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    res.json({ message: 'Batch updated successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT set a batch as active
router.put('/:id/activate', async (req, res) => {
  const batchId = parseInt(req.params.id);
  try {
    await query(`UPDATE admission_batches SET is_active = false WHERE deleted_at IS NULL`);
    await query(`UPDATE admission_batches SET is_active = true WHERE id = $1`, [batchId]);
    const { rows } = await query(`SELECT year_label, id_prefix, id_offset FROM admission_batches WHERE id = $1`, [batchId]);
    if (rows[0]) {
      const b = rows[0];
      await query(`INSERT INTO app_settings (key, value) VALUES ('student_id_prefix', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [b.id_prefix]);
      await query(`INSERT INTO app_settings (key, value) VALUES ('student_id_offset', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [String(b.id_offset)]);
      await query(`INSERT INTO app_settings (key, value) VALUES ('current_batch_year', $1) ON CONFLICT (key) DO UPDATE SET value = $1`, [b.year_label]);
    }
    res.json({ message: 'Batch activated successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT archive/unarchive batch (preserving records)
router.put('/:id/archive', async (req, res) => {
  try {
    await query(`UPDATE admission_batches SET is_archived = true, is_active = false WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Academic year archived successfully without deleting data.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/unarchive', async (req, res) => {
  try {
    await query(`UPDATE admission_batches SET is_archived = false WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Academic year unarchived successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE (soft-delete) a batch
router.delete('/:id', async (req, res) => {
  try {
    await query(`UPDATE admission_batches SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Batch deleted.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
module.exports.formatStudentId = formatStudentId;
