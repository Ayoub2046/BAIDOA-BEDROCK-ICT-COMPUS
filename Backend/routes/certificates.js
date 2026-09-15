// Backend/routes/certificates.js
// Student digital certificate management & secure student download

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../database.js');
const { uploadBuffer } = require('../services/storage');
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|doc|docx|png|jpg|jpeg/i;
    if (!allowed.test(path.extname(file.originalname))) {
      return cb(new Error('Only PDF, DOC, DOCX, PNG, and JPG files allowed'));
    }
    cb(null, true);
  }
});

// Helper to accept either 'file' or 'certificate' form field
const uploadCertFile = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'certificate', maxCount: 1 }
]);

// GET all certificates (admin view with filters)
router.get('/', async (req, res) => {
  try {
    const { student_id, academic_year, cert_type, archived } = req.query;
    let sql = `
      SELECT cert.*, 
             s.name AS student_name,
             s.student_id_code,
             s.grade AS student_grade,
             s.status AS student_status
      FROM certificates cert
      JOIN students s ON s.id = cert.student_id
      WHERE cert.deleted_at IS NULL AND s.deleted_at IS NULL
    `;
    const params = [];
    let idx = 1;

    if (student_id) { sql += ` AND cert.student_id = $${idx++}`; params.push(parseInt(student_id)); }
    if (academic_year && academic_year !== 'all') { sql += ` AND cert.academic_year = $${idx++}`; params.push(academic_year); }
    if (cert_type && cert_type !== 'all') { sql += ` AND LOWER(cert.cert_type) = LOWER($${idx++})`; params.push(cert_type); }
    if (archived !== undefined) { sql += ` AND cert.is_archived = $${idx++}`; params.push(archived === 'true'); }

    sql += ` ORDER BY cert.uploaded_at DESC, cert.id DESC`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET published certificates for a student (My Certificates student/alumni view)
router.get('/student/:studentId', async (req, res) => {
  const studentId = parseInt(req.params.studentId);
  if (isNaN(studentId)) return res.status(400).json({ error: 'Invalid student ID' });
  try {
    const { rows } = await query(`
      SELECT id, title, cert_type, certificate_number, academic_year, issue_date, 
             description, file_path, uploaded_at, is_available, is_published
      FROM certificates
      WHERE student_id = $1 
        AND is_available = true 
        AND (is_published = true OR is_published IS NULL)
        AND deleted_at IS NULL
      ORDER BY issue_date DESC, uploaded_at DESC
    `, [studentId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET published certificates (alias for student dashboard)
router.get('/my-certificates/:studentId', async (req, res) => {
  const studentId = parseInt(req.params.studentId);
  if (isNaN(studentId)) return res.status(400).json({ error: 'Invalid student ID' });
  try {
    const { rows } = await query(`
      SELECT id, title, cert_type, certificate_number, academic_year, issue_date, 
             description, file_path, uploaded_at, is_available, is_published
      FROM certificates
      WHERE student_id = $1 
        AND is_available = true 
        AND (is_published = true OR is_published IS NULL)
        AND deleted_at IS NULL
      ORDER BY issue_date DESC, uploaded_at DESC
    `, [studentId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET direct download certificate file
router.get('/download/:id', async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM certificates WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Certificate not found' });
    const cert = rows[0];

    // If file_path is local
    if (cert.file_path && cert.file_path.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, '../../', cert.file_path);
      if (fs.existsSync(localPath)) {
        return res.download(localPath, `${cert.title || 'Certificate'}${path.extname(localPath)}`);
      }
    }
    // If Supabase URL or remote
    if (cert.file_path) {
      return res.redirect(cert.file_path);
    }
    res.status(404).json({ error: 'Certificate file not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload a certificate for a student (admin)
router.post('/', uploadCertFile, async (req, res) => {
  const uploadedFile = (req.files && req.files.file && req.files.file[0]) || 
                       (req.files && req.files.certificate && req.files.certificate[0]);

  const { student_id, title, cert_type, certificate_number, academic_year, issue_date, description, uploaded_by } = req.body;
  if (!student_id || !uploadedFile) {
    return res.status(400).json({ error: 'student_id and certificate document file are required' });
  }
  const sid = parseInt(student_id);
  if (isNaN(sid)) return res.status(400).json({ error: 'Invalid student_id' });

  // Verify student exists
  try {
    const { rows: sRows } = await query(`SELECT id, student_id_code, academic_year FROM students WHERE id = $1 AND deleted_at IS NULL`, [sid]);
    if (!sRows[0]) return res.status(404).json({ error: 'Student not found' });
    const student = sRows[0];

    let filePath;
    try {
      filePath = await uploadBuffer(
        uploadedFile.buffer,
        'certificates',
        `cert_${sid}_${Date.now()}${path.extname(uploadedFile.originalname)}`,
        uploadedFile.mimetype
      );
    } catch (uploadErr) {
      const uploadDir = path.join(__dirname, '../../uploads/certificates');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const fname = `cert_${sid}_${Date.now()}${path.extname(uploadedFile.originalname)}`;
      fs.writeFileSync(path.join(uploadDir, fname), uploadedFile.buffer);
      filePath = `/uploads/certificates/${fname}`;
    }

    const certTitle = (title || 'Certificate of Completion').trim();
    const certType = cert_type || 'completion';
    const certYear = academic_year || student.academic_year || '2026';
    const certNum = certificate_number || `CERT-${certYear}-${String(sid).padStart(4, '0')}`;
    const iDate = issue_date || new Date().toISOString().split('T')[0];

    const { rows } = await query(`
      INSERT INTO certificates 
        (student_id, title, cert_type, certificate_number, academic_year, issue_date, description, file_path, uploaded_by, is_available, is_published, is_archived)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, true, false)
      RETURNING *
    `, [sid, certTitle, certType, certNum, certYear, iDate, description || null, filePath, uploaded_by || 'Admin']);

    res.status(201).json({ message: 'Certificate uploaded and published successfully.', certificate: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update certificate details / publish status
router.put('/:id', async (req, res) => {
  const { is_available, is_published, is_archived, title, cert_type, certificate_number, academic_year, issue_date, description } = req.body;
  try {
    const sets = [];
    const vals = [];
    let idx = 1;
    if (is_available !== undefined) { sets.push(`is_available = $${idx++}`); vals.push(Boolean(is_available)); }
    if (is_published !== undefined) { sets.push(`is_published = $${idx++}`); vals.push(Boolean(is_published)); }
    if (is_archived !== undefined) { sets.push(`is_archived = $${idx++}`); vals.push(Boolean(is_archived)); }
    if (title !== undefined) { sets.push(`title = $${idx++}`); vals.push(title); }
    if (cert_type !== undefined) { sets.push(`cert_type = $${idx++}`); vals.push(cert_type); }
    if (certificate_number !== undefined) { sets.push(`certificate_number = $${idx++}`); vals.push(certificate_number); }
    if (academic_year !== undefined) { sets.push(`academic_year = $${idx++}`); vals.push(academic_year); }
    if (issue_date !== undefined) { sets.push(`issue_date = $${idx++}`); vals.push(issue_date); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.id);
    await query(`UPDATE certificates SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    res.json({ message: 'Certificate updated successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE (soft delete) a certificate
router.delete('/:id', async (req, res) => {
  try {
    await query(`UPDATE certificates SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Certificate removed.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
