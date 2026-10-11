// Backend/migrate_exam_system.js
// Non-destructive migration for separate monthly exams, 3-4 assessment components,
// lifecycle management, and audit logging.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { query, pool } = require('./database.js');

async function migrate() {
    console.log('=== Starting Non-Destructive Exam System Migration ===');
    try {
        // 1. Upgrade exam_periods to be the full Exam entity
        console.log('1. Enhancing exam_periods table...');
        await query(`
            ALTER TABLE exam_periods
                ADD COLUMN IF NOT EXISTS exam_code TEXT,
                ADD COLUMN IF NOT EXISTS total_marks NUMERIC(5,2) DEFAULT 100.00,
                ADD COLUMN IF NOT EXISTS num_components INTEGER DEFAULT 3,
                ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open',
                ADD COLUMN IF NOT EXISTS start_date DATE,
                ADD COLUMN IF NOT EXISTS end_date DATE,
                ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW(),
                ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'Admin';
        `);
        await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_periods_code ON exam_periods (exam_code) WHERE deleted_at IS NULL;`);

        // Update status for existing records based on is_locked
        await query(`
            UPDATE exam_periods 
            SET status = CASE 
                WHEN is_locked = true THEN 'locked' 
                WHEN is_archived = true THEN 'closed'
                ELSE 'open' 
            END
            WHERE status IS NULL OR status = 'draft';
        `);

        // Ensure exam_code is filled for existing records
        const { rows: existingPeriods } = await query(`SELECT id, name, year, month FROM exam_periods WHERE exam_code IS NULL`);
        for (const p of existingPeriods) {
            const m = p.month ? String(p.month).padStart(2, '0') : '00';
            const code = `EXAM-${p.year || 2026}-M${m}-${p.id}`;
            await query(`UPDATE exam_periods SET exam_code = $1 WHERE id = $2`, [code, p.id]);
        }
        console.log('✓ exam_periods enhanced successfully.');

        // 2. Create exam_components table
        console.log('2. Creating exam_components table...');
        await query(`
            CREATE TABLE IF NOT EXISTS exam_components (
                id SERIAL PRIMARY KEY,
                exam_id INTEGER NOT NULL REFERENCES exam_periods(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                component_key TEXT NOT NULL,
                max_marks NUMERIC(5,2) NOT NULL DEFAULT 20.00,
                order_num INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT NOW(),
                deleted_at TIMESTAMP NULL
            );
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_exam_components_exam_id ON exam_components (exam_id) WHERE deleted_at IS NULL;`);
        console.log('✓ exam_components table ready.');

        // 3. Create exam_classes junction table
        console.log('3. Creating exam_classes junction table...');
        await query(`
            CREATE TABLE IF NOT EXISTS exam_classes (
                exam_id INTEGER NOT NULL REFERENCES exam_periods(id) ON DELETE CASCADE,
                class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                assigned_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (exam_id, class_id)
            );
        `);
        console.log('✓ exam_classes table ready.');

        // 4. Create exam_subjects junction table
        console.log('4. Creating exam_subjects junction table...');
        await query(`
            CREATE TABLE IF NOT EXISTS exam_subjects (
                id SERIAL PRIMARY KEY,
                exam_id INTEGER NOT NULL REFERENCES exam_periods(id) ON DELETE CASCADE,
                class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                subject_name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                CONSTRAINT uq_exam_subject UNIQUE (exam_id, class_id, subject_name)
            );
        `);
        console.log('✓ exam_subjects table ready.');

        // 5. Create exam_audit_logs table
        console.log('5. Creating exam_audit_logs table...');
        await query(`
            CREATE TABLE IF NOT EXISTS exam_audit_logs (
                id SERIAL PRIMARY KEY,
                exam_id INTEGER REFERENCES exam_periods(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                old_status VARCHAR(20),
                new_status VARCHAR(20),
                changed_by TEXT NOT NULL,
                reason TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_exam_audit_logs_exam ON exam_audit_logs (exam_id);`);
        console.log('✓ exam_audit_logs table ready.');

        // 6. Create exam_aggregate_configs table
        console.log('6. Creating exam_aggregate_configs table...');
        await query(`
            CREATE TABLE IF NOT EXISTS exam_aggregate_configs (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                academic_year TEXT NOT NULL DEFAULT '2026',
                class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
                calculation_method VARCHAR(50) DEFAULT 'weighted',
                weights_json JSONB NOT NULL,
                is_published BOOLEAN DEFAULT false,
                created_by TEXT DEFAULT 'Admin',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('✓ exam_aggregate_configs table ready.');

        // 7. Enhance results table (non-destructively)
        console.log('7. Enhancing results table with component metadata...');
        await query(`
            ALTER TABLE results
                ADD COLUMN IF NOT EXISTS component_id INTEGER REFERENCES exam_components(id) ON DELETE SET NULL,
                ADD COLUMN IF NOT EXISTS component_name TEXT,
                ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(30) DEFAULT 'attended';
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_results_period_id ON results (period_id) WHERE deleted_at IS NULL;`);
        console.log('✓ results table enhanced.');

        // 8. Backfill components for existing exam_periods so existing results are fully linked
        console.log('8. Ensuring default components exist for current exams...');
        const { rows: periods } = await query(`SELECT id, name FROM exam_periods WHERE deleted_at IS NULL`);
        for (const p of periods) {
            const { rows: compCount } = await query(`SELECT COUNT(*) as c FROM exam_components WHERE exam_id = $1 AND deleted_at IS NULL`, [p.id]);
            if (parseInt(compCount[0].c) === 0) {
                // Seed standard oral (20) & practical (80) = 100 for existing records
                await query(`
                    INSERT INTO exam_components (exam_id, name, component_key, max_marks, order_num)
                    VALUES 
                        ($1, 'Oral Exam', 'oral_exam', 20.00, 1),
                        ($1, 'Practical Exam', 'practical_exam', 80.00, 2)
                `, [p.id]);
                console.log(`  Seeded components for Exam Period ID ${p.id} (${p.name})`);
            }

            // Assign all existing classes to this exam if not assigned
            await query(`
                INSERT INTO exam_classes (exam_id, class_id)
                SELECT $1, id FROM classes WHERE deleted_at IS NULL
                ON CONFLICT DO NOTHING
            `, [p.id]);
        }

        // Link existing results to components where component_id is null
        await query(`
            UPDATE results r
            SET component_id = ec.id, component_name = ec.name
            FROM exam_components ec
            WHERE r.period_id = ec.exam_id 
              AND (r.exam_type = ec.component_key OR (r.exam_type = 'quiz' AND ec.component_key = 'oral_exam') OR (r.exam_type = 'final' AND ec.component_key = 'practical_exam'))
              AND r.component_id IS NULL;
        `);

        console.log('=== Migration Finished Successfully With Zero Data Loss ===');
    } catch (err) {
        console.error('Migration failed:', err);
        throw err;
    } finally {
        await pool.end();
    }
}

migrate();
