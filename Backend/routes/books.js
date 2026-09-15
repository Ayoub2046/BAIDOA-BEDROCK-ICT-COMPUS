// Backend/routes/books.js
// Digital Library Management & Student/Alumni Educational Resources

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../database.js');
const { uploadBuffer } = require('../services/storage');
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max for educational documents/books
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|doc|docx|epub|png|jpg|jpeg/i;
    if (!allowed.test(path.extname(file.originalname))) {
      return cb(new Error('Allowed file types: PDF, DOC, DOCX, EPUB, PNG, JPG'));
    }
    cb(null, true);
  }
});

const uploadLibraryFiles = upload.fields([
  { name: 'document', maxCount: 1 },
  { name: 'cover', maxCount: 1 }
]);

// GET all library resources (admin view with multi-filter)
router.get('/', async (req, res) => {
  try {
    const { category, subject, academic_year, search, archived } = req.query;
    let sql = `SELECT * FROM books WHERE deleted_at IS NULL`;
    const params = [];
    let idx = 1;

    if (category && category !== 'all') {
      sql += ` AND LOWER(category) = LOWER($${idx++})`;
      params.push(category);
    }
    if (subject && subject !== 'all') {
      sql += ` AND LOWER(subject) = LOWER($${idx++})`;
      params.push(subject);
    }
    if (academic_year && academic_year !== 'all') {
      sql += ` AND (academic_year = $${idx} OR academic_year = 'All')`;
      params.push(academic_year);
      idx++;
    }
    if (archived !== undefined) {
      sql += ` AND is_archived = $${idx++}`;
      params.push(archived === 'true');
    }
    if (search && search.trim()) {
      sql += ` AND (title ILIKE $${idx} OR author ILIKE $${idx} OR subject ILIKE $${idx} OR category ILIKE $${idx})`;
      params.push(`%${search.trim()}%`);
      idx++;
    }

    sql += ` ORDER BY id DESC`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET published library resources for Student & Alumni Dashboard
router.get('/student-library', async (req, res) => {
  try {
    const { category, subject, academic_year, search, is_alumni } = req.query;
    let sql = `
      SELECT id, title, author, isbn, category, subject, academic_year, 
             file_path, file_type, cover, status, description, digitallink, 
             target_audience, created_at
      FROM books 
      WHERE deleted_at IS NULL 
        AND is_published = true 
        AND is_archived = false
    `;
    const params = [];
    let idx = 1;

    // Filter by audience if alumni
    if (is_alumni === 'true') {
      sql += ` AND target_audience IN ('all', 'alumni')`;
    }

    if (category && category !== 'all') {
      sql += ` AND LOWER(category) = LOWER($${idx++})`;
      params.push(category);
    }
    if (subject && subject !== 'all') {
      sql += ` AND LOWER(subject) = LOWER($${idx++})`;
      params.push(subject);
    }
    if (academic_year && academic_year !== 'all') {
      sql += ` AND (academic_year = $${idx} OR academic_year = 'All')`;
      params.push(academic_year);
      idx++;
    }
    if (search && search.trim()) {
      sql += ` AND (title ILIKE $${idx} OR author ILIKE $${idx} OR subject ILIKE $${idx} OR description ILIKE $${idx})`;
      params.push(`%${search.trim()}%`);
      idx++;
    }

    sql += ` ORDER BY category ASC, title ASC`;
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET distinct categories and subjects in the library
router.get('/categories', async (req, res) => {
  try {
    const { rows: catRows } = await query(`SELECT DISTINCT category FROM books WHERE category IS NOT NULL AND deleted_at IS NULL ORDER BY category`);
    const { rows: subjRows } = await query(`SELECT DISTINCT subject FROM books WHERE subject IS NOT NULL AND deleted_at IS NULL ORDER BY subject`);
    res.json({
      categories: catRows.map(r => r.category),
      subjects: subjRows.map(r => r.subject)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST add a new library item (book, past paper, notes, school doc)
router.post('/', uploadLibraryFiles, async (req, res) => {
  const docFile = req.files && req.files.document && req.files.document[0];
  const coverFile = req.files && req.files.cover && req.files.cover[0];
  const { title, author, isbn, category, subject, academic_year, status, description, digitallink, target_audience } = req.body;

  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    let filePath = digitallink || '';
    if (docFile) {
      try {
        filePath = await uploadBuffer(docFile.buffer, 'library', `doc_${Date.now()}${path.extname(docFile.originalname)}`, docFile.mimetype);
      } catch (e) {
        const dir = path.join(__dirname, '../../uploads/library');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const fname = `doc_${Date.now()}${path.extname(docFile.originalname)}`;
        fs.writeFileSync(path.join(dir, fname), docFile.buffer);
        filePath = `/uploads/library/${fname}`;
      }
    }

    let coverUrl = '';
    if (coverFile) {
      try {
        coverUrl = await uploadBuffer(coverFile.buffer, 'library_covers', `cover_${Date.now()}${path.extname(coverFile.originalname)}`, coverFile.mimetype);
      } catch (e) {
        const dir = path.join(__dirname, '../../uploads/library/covers');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const fname = `cover_${Date.now()}${path.extname(coverFile.originalname)}`;
        fs.writeFileSync(path.join(dir, fname), coverFile.buffer);
        coverUrl = `/uploads/library/covers/${fname}`;
      }
    }

    const ext = docFile ? path.extname(docFile.originalname).replace('.','').toUpperCase() : 'PDF';

    const { rows } = await query(`
      INSERT INTO books 
        (title, author, isbn, category, subject, academic_year, cover, status, description, file_path, file_type, digitallink, target_audience, is_published, is_archived)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, false)
      RETURNING *
    `, [
      title.trim(), 
      (author || 'Bedrock Faculty').trim(), 
      isbn || null, 
      category || 'Textbooks', 
      subject || 'General', 
      academic_year || 'All', 
      coverUrl || null, 
      status || 'Available', 
      description || null, 
      filePath || null, 
      ext, 
      filePath || null,
      target_audience || 'all'
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update a library book/resource
router.put('/:id', async (req, res) => {
  const { title, author, category, subject, academic_year, cover, status, checkedoutto, digitallink, description, is_published, is_archived, target_audience } = req.body;
  try {
    const sets = [];
    const vals = [];
    let idx = 1;
    if (title !== undefined) { sets.push(`title = $${idx++}`); vals.push(title); }
    if (author !== undefined) { sets.push(`author = $${idx++}`); vals.push(author); }
    if (category !== undefined) { sets.push(`category = $${idx++}`); vals.push(category); }
    if (subject !== undefined) { sets.push(`subject = $${idx++}`); vals.push(subject); }
    if (academic_year !== undefined) { sets.push(`academic_year = $${idx++}`); vals.push(academic_year); }
    if (cover !== undefined) { sets.push(`cover = $${idx++}`); vals.push(cover); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); vals.push(status); }
    if (checkedoutto !== undefined) { sets.push(`checkedoutto = $${idx++}`); vals.push(checkedoutto); }
    if (digitallink !== undefined) { sets.push(`digitallink = $${idx++}`); sets.push(`file_path = $${idx++}`); vals.push(digitallink); vals.push(digitallink); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
    if (is_published !== undefined) { sets.push(`is_published = $${idx++}`); vals.push(Boolean(is_published)); }
    if (is_archived !== undefined) { sets.push(`is_archived = $${idx++}`); vals.push(Boolean(is_archived)); }
    if (target_audience !== undefined) { sets.push(`target_audience = $${idx++}`); vals.push(target_audience); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.id);
    await query(`UPDATE books SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    res.json({ message: 'Resource updated successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE (soft-delete) a library item
router.delete('/:id', async (req, res) => {
  try {
    await query(`UPDATE books SET deleted_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ message: 'Library item removed.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;