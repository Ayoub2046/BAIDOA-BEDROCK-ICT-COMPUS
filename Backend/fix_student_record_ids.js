// Backend/fix_student_record_ids.js
// Standardize all 20 active student record IDs to BB260001 - BB260020,
// fix student #10, configure admission_batches, and ensure expenses table exists.

const { query, pool } = require('./database.js');

async function runMigration() {
    console.log('=== STARTING STUDENT ID & EXPENSES MIGRATION ===');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Create expenses table if not exists
        console.log('Creating expenses table if not exists...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS expenses (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                category VARCHAR(50) NOT NULL,
                amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                currency VARCHAR(10) NOT NULL DEFAULT 'USD',
                expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
                payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
                reference_no VARCHAR(100),
                recipient_name VARCHAR(255),
                teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'paid',
                notes TEXT,
                receipt_url TEXT,
                recorded_by VARCHAR(100),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                deleted_at TIMESTAMPTZ
            );

            CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category) WHERE deleted_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date) WHERE deleted_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_expenses_teacher_id ON expenses(teacher_id) WHERE deleted_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status) WHERE deleted_at IS NULL;
        `);
        console.log('✓ expenses table & indexes verified');

        // 2. Fix admission batch 1 configuration
        console.log('Updating admission_batches default settings...');
        await client.query(`
            UPDATE admission_batches 
            SET id_offset = 0, id_separator = '', id_digits = 4, year_label = '2026', id_prefix = 'BB'
            WHERE id = 1
        `);

        // 3. Fetch all active students ordered by id
        const { rows: students } = await client.query(`
            SELECT id, name, student_id_code, admission_batch_id 
            FROM students 
            WHERE deleted_at IS NULL 
            ORDER BY id ASC
        `);
        console.log(`Found ${students.length} active students to standardize.`);

        // 4. Update each student to clean BB260001 - BB260020 format
        for (let i = 0; i < students.length; i++) {
            const s = students[i];
            const cleanId = 'BB' + String(260000 + s.id).padStart(6, '0');
            console.log(`Updating student #${s.id} (${s.name}): "${s.student_id_code}" -> "${cleanId}"`);
            
            await client.query(`
                UPDATE students 
                SET student_id_code = $1, 
                    academic_year = '2026', 
                    admission_batch_id = 1
                WHERE id = $2
            `, [cleanId, s.id]);

            // Synchronize student_auth plain_password default if still default format
            const defaultOldPwd = 'bb' + String(s.student_id_code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanPwd = 'bb' + String(260000 + s.id);
            await client.query(`
                UPDATE student_auth 
                SET plain_password = CASE 
                    WHEN plain_password IS NULL OR plain_password = '' OR plain_password = $1 THEN $2
                    ELSE plain_password 
                END
                WHERE student_id = $3
            `, [defaultOldPwd, cleanPwd, s.id]);
        }

        await client.query('COMMIT');
        console.log('=== MIGRATION COMPLETED SUCCESSFULLY ===');
        process.exit(0);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
    }
}

runMigration();
