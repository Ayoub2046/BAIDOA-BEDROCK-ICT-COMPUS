// Migration: New features - Year-based Admissions, Monthly Exams, Certificates
require('dotenv').config();
const { query } = require('./database.js');

async function migrate() {
  try {
    // 1. Add admission_batches table (year-based admissions with admin prefix)
    await query(`
      CREATE TABLE IF NOT EXISTS admission_batches (
        id SERIAL PRIMARY KEY,
        year_label TEXT NOT NULL,
        id_prefix TEXT NOT NULL DEFAULT 'BB',
        id_offset INTEGER NOT NULL DEFAULT 260000,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        start_date DATE,
        end_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP NULL
      )
    `);
    console.log('✓ admission_batches table ready');

    // 2. Add exam_periods table (monthly/yearly exam cycles)
    await query(`
      CREATE TABLE IF NOT EXISTS exam_periods (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER,
        period_type TEXT DEFAULT 'monthly',
        academic_year TEXT,
        is_active BOOLEAN DEFAULT true,
        is_archived BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP NULL
      )
    `);
    console.log('✓ exam_periods table ready');

    // 3. Add period_id and admission_batch_id to results
    await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS period_id INTEGER REFERENCES exam_periods(id) ON DELETE SET NULL`);
    await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS admission_batch_id INTEGER REFERENCES admission_batches(id) ON DELETE SET NULL`);
    console.log('✓ results: period_id and admission_batch_id columns ready');

    // 4. Add certificates table
    await query(`
      CREATE TABLE IF NOT EXISTS certificates (
        id SERIAL PRIMARY KEY,
        student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT 'Certificate of Completion',
        file_path TEXT NOT NULL,
        uploaded_by TEXT,
        uploaded_at TIMESTAMP DEFAULT NOW(),
        is_available BOOLEAN DEFAULT true,
        deleted_at TIMESTAMP NULL
      )
    `);
    console.log('✓ certificates table ready');

    // 5. Add batch_id to students (so we know which admission year they belong to)
    await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS admission_batch_id INTEGER REFERENCES admission_batches(id) ON DELETE SET NULL`);
    console.log('✓ students: admission_batch_id column ready');

    // 6. Seed a default 2026 admission batch
    const existBatch = await query(`SELECT id FROM admission_batches WHERE year_label = '2026' LIMIT 1`);
    if (existBatch.rows.length === 0) {
      await query(`
        INSERT INTO admission_batches (year_label, id_prefix, id_offset, description, is_active)
        VALUES ('2026', 'BB', 260000, 'Batch 2026 — students joining 2026 get ID prefix BB26', true)
      `);
      console.log('✓ default admission batch 2026 seeded');
    } else {
      console.log('✓ admission batch 2026 already exists (id=' + existBatch.rows[0].id + ')');
    }

    // 7. Ensure app_settings has batch keys
    const batchSettings = [
      { key: 'current_batch_year', value: '2026' },
      { key: 'admission_batch_prefix', value: 'BB' },
    ];
    for (const s of batchSettings) {
      await query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [s.key, s.value]
      );
    }
    console.log('✓ app_settings batch keys ready');

    // 8. Create index for exam_periods
    await query(`CREATE INDEX IF NOT EXISTS idx_exam_periods_year ON exam_periods (year, month)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates (student_id) WHERE deleted_at IS NULL`);
    console.log('✓ indexes created');

    console.log('\n✅ ALL MIGRATIONS COMPLETED SUCCESSFULLY');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration error:', err.message, err.stack);
    process.exit(1);
  }
}

migrate();
