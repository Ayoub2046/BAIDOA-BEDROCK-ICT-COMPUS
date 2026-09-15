// Backend/migrate_academic_architecture.js
// Migration for Academic-Year-Based Architecture: Admissions, Exams, Archives, Library & Certificates
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { query } = require('./database.js');

async function migrate() {
  console.log('--- Starting Academic Architecture Migration ---');
  try {
    // 1. Update admission_batches
    await query(`
      ALTER TABLE admission_batches 
        ADD COLUMN IF NOT EXISTS id_separator TEXT DEFAULT '-',
        ADD COLUMN IF NOT EXISTS id_digits INTEGER DEFAULT 4,
        ADD COLUMN IF NOT EXISTS id_format TEXT DEFAULT 'BB{year_short}{sep}{num}',
        ADD COLUMN IF NOT EXISTS generation_mode TEXT DEFAULT 'auto',
        ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false
    `);
    console.log('✓ admission_batches table updated');

    // Ensure default active batch for 2026 if none exists
    const { rows: batchRows } = await query(`SELECT * FROM admission_batches WHERE deleted_at IS NULL`);
    if (batchRows.length === 0) {
      await query(`
        INSERT INTO admission_batches (year_label, id_prefix, id_offset, id_separator, id_digits, description, is_active, is_archived)
        VALUES ('2026', 'BB', 0, '-', 4, 'Academic Year 2026', true, false)
      `);
      console.log('✓ Created default 2026 admission batch');
    }

    // 2. Update students table
    await query(`
      ALTER TABLE students 
        ADD COLUMN IF NOT EXISTS student_id_code TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active',
        ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '2026',
        ADD COLUMN IF NOT EXISTS admission_batch_id INTEGER REFERENCES admission_batches(id) ON DELETE SET NULL
    `);
    console.log('✓ students table updated');

    // Backfill student_id_code and academic_year for existing students
    const { rows: students } = await query(`SELECT id, student_id_code, enrollmentdate FROM students WHERE deleted_at IS NULL ORDER BY id`);
    const defaultBatch = (await query(`SELECT id, year_label, id_prefix, id_offset, id_separator, id_digits FROM admission_batches WHERE is_active = true LIMIT 1`)).rows[0] 
      || { id: 1, year_label: '2026', id_prefix: 'BB', id_offset: 0, id_separator: '-', id_digits: 4 };

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      if (!s.student_id_code) {
        const numPart = String(defaultBatch.id_offset + (i + 1)).padStart(defaultBatch.id_digits || 4, '0');
        const yearShort = String(defaultBatch.year_label).slice(-2);
        const sep = defaultBatch.id_separator !== undefined ? defaultBatch.id_separator : '-';
        const prefix = defaultBatch.id_prefix || 'BB';
        const code = `${prefix}${yearShort}${sep}${numPart}`; // e.g. BB26-0001
        await query(`
          UPDATE students 
          SET student_id_code = $1, academic_year = $2, admission_batch_id = $3, status = COALESCE(status, 'Active')
          WHERE id = $4
        `, [code, defaultBatch.year_label, defaultBatch.id, s.id]);
        console.log(`  Assigned code ${code} to student ID ${s.id}`);
      }
    }

    // Add unique index on student_id_code (for non-deleted students)
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_students_student_id_code ON students (student_id_code) WHERE deleted_at IS NULL`);
    console.log('✓ idx_students_student_id_code unique index ensured');

    // 3. Update exam_periods table
    await query(`
      ALTER TABLE exam_periods 
        ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS exam_date DATE
    `);
    console.log('✓ exam_periods table updated');

    // 4. Update results table
    await query(`
      ALTER TABLE results 
        ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '2026',
        ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false
    `);
    // Backfill results academic_year if null
    await query(`UPDATE results SET academic_year = '2026' WHERE academic_year IS NULL`);
    console.log('✓ results table updated');

    // 5. Update certificates table
    await query(`
      ALTER TABLE certificates 
        ADD COLUMN IF NOT EXISTS cert_type TEXT DEFAULT 'completion',
        ADD COLUMN IF NOT EXISTS certificate_number TEXT,
        ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '2026',
        ADD COLUMN IF NOT EXISTS issue_date DATE DEFAULT CURRENT_DATE,
        ADD COLUMN IF NOT EXISTS description TEXT,
        ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false
    `);
    console.log('✓ certificates table updated');

    // 6. Update books table (Digital Library)
    await query(`
      ALTER TABLE books 
        ADD COLUMN IF NOT EXISTS cover TEXT,
        ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Available',
        ADD COLUMN IF NOT EXISTS file_path TEXT,
        ADD COLUMN IF NOT EXISTS file_type TEXT DEFAULT 'PDF',
        ADD COLUMN IF NOT EXISTS subject TEXT,
        ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT 'All',
        ADD COLUMN IF NOT EXISTS description TEXT,
        ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS target_audience TEXT DEFAULT 'all'
    `);
    console.log('✓ books table updated');

    // 7. Create student_academic_history table for permanent annual records
    await query(`
      CREATE TABLE IF NOT EXISTS student_academic_history (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        academic_year TEXT NOT NULL,
        class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
        class_name TEXT,
        grade TEXT,
        gpa NUMERIC(4,2),
        total_subjects INTEGER DEFAULT 0,
        average_score NUMERIC(5,2),
        attendance_percentage NUMERIC(5,2),
        status_in_year TEXT DEFAULT 'Promoted',
        remarks TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_student_history_student ON student_academic_history (student_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_student_history_year ON student_academic_history (academic_year)`);
    console.log('✓ student_academic_history table ready');

    // 8. Seed sample academic resources into library if empty
    const { rows: bookRows } = await query(`SELECT COUNT(*) AS count FROM books WHERE deleted_at IS NULL`);
    if (parseInt(bookRows[0].count) === 0) {
      await query(`
        INSERT INTO books (title, author, category, subject, academic_year, file_type, status, description, digitallink, is_published, target_audience)
        VALUES 
          ('Introduction to ICT & Computing', 'Eng. Ayoub', 'Textbooks', 'Computer Science', '2026', 'PDF', 'Available', 'Official semester textbook covering computer fundamentals and operating systems.', '/uploads/library/sample_ict.pdf', true, 'all'),
          ('Web Development Fundamentals', 'Bedrock Faculty', 'Study Notes', 'Web Engineering', '2026', 'PDF', 'Available', 'HTML, CSS, JavaScript core principles and responsive design guides.', '/uploads/library/sample_web.pdf', true, 'all'),
          ('Mid-Term Examination Past Papers (2025)', 'Examination Board', 'Past Papers', 'Computer Science', '2025', 'PDF', 'Available', 'Official past papers with answer key for exam review and preparation.', '/uploads/library/sample_past_papers.pdf', true, 'all'),
          ('Campus Code of Conduct & Academic Regulations', 'Administration', 'School Documents', 'General', 'All', 'PDF', 'Available', 'University policies, student rights, clearance requirements, and grading criteria.', '/uploads/library/sample_regulations.pdf', true, 'all')
      `);
      console.log('✓ Seeded initial digital library resources');
    }

    console.log('--- Migration Completed Successfully ---');
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
