
// backend/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = 3000;

// --- 1. Middleware ---
app.use(cors());
app.use(express.json());

// --- 2. Static file serving (works locally and on Vercel serverless) ---
const projectRoot = path.join(__dirname, '..');
app.use(express.static(projectRoot));
app.use('/HTML', express.static(path.join(projectRoot, 'HTML')));
app.use('/css', express.static(path.join(projectRoot, 'css')));
app.use('/images', express.static(path.join(projectRoot, 'images')));
app.use('/JS', express.static(path.join(projectRoot, 'JS')));

const uploadsPath = path.join(projectRoot, 'uploads');
app.use('/uploads', express.static(uploadsPath));

// Fallback for any missing file under /uploads/ — serve transparent placeholder
app.use('/uploads', (req, res) => {
    const filePath = path.join(uploadsPath, req.path);
    if (!fs.existsSync(filePath)) {
        res.set('Content-Type', 'image/svg+xml');
        res.send('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="transparent"/></svg>');
    } else {
        res.status(404).end();
    }
});

// Root redirects
app.get('/', (req, res) => {
    res.redirect('/HTML/index.html');
});
app.get('/index.html', (req, res) => {
    res.redirect('/HTML/index.html');
});
app.get('/api', (req, res) => {
    res.redirect('/HTML/index.html');
});
app.get('/api/', (req, res) => {
    res.redirect('/HTML/index.html');
});
app.get('/favicon.ico', (req, res) => {
    res.redirect('/images/BEDRCOK LOGO.JPG');
});

// Explicit PWA Manifest & Service Worker Routes (guaranteed JSON/JS serving)
app.get('/manifest.json', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type('application/manifest+json');
    const filePath = path.join(projectRoot, 'manifest.json');
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath, {
            headers: {
                'Content-Type': 'application/manifest+json; charset=utf-8'
            }
        });
    }
    try {
        const directData = require(path.join(projectRoot, 'manifest.json'));
        return res.send(JSON.stringify(directData));
    } catch (e) {
        return res.send(JSON.stringify({
            name: "Baidoa Bedrock ICT Campus",
            short_name: "Bedrock ICT",
            start_url: "/HTML/index.html",
            id: "/HTML/index.html",
            scope: "/",
            display: "standalone",
            theme_color: "#0d4f8c",
            background_color: "#092d52",
            icons: [
                { src: "/images/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
                { src: "/images/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
                { src: "/images/icons/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
                { src: "/images/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" }
            ]
        }));
    }
});

app.get('/service-worker.js', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Service-Worker-Allowed', '/');
    res.type('application/javascript');
    const filePath = path.join(projectRoot, 'service-worker.js');
    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath, {
            headers: {
                'Content-Type': 'application/javascript; charset=utf-8',
                'Service-Worker-Allowed': '/'
            }
        });
    }
    try {
        const altPath = path.resolve(__dirname, '../service-worker.js');
        if (fs.existsSync(altPath)) {
            return res.sendFile(altPath, {
                headers: {
                    'Content-Type': 'application/javascript; charset=utf-8',
                    'Service-Worker-Allowed': '/'
                }
            });
        }
    } catch (e) {}
    res.status(404).send('// Service worker not found');
});
// --- 2. API Routes ---
app.use('/api/students', require('./routes/students.js'));
app.use('/api/auth', require('./routes/auth.js'));
app.use('/api/teachers', require('./routes/teachers.js'));
app.use('/api/users', require('./routes/users.js'));
app.use('/api/classes', require('./routes/classes.js'));
app.use('/api/fees', require('./routes/fees.js'));
app.use('/api/events', require('./routes/events.js'));
app.use('/api/books', require('./routes/books.js'));
app.use('/api/content', require('./routes/content.js'));
app.use('/api/results', require('./routes/results.js'));
app.use('/api/messages', require('./routes/messages.js'));
app.use('/api/reports', require('./routes/reports.js'));
app.use('/api/dashboard', require('./routes/dashboard.js'));
app.use('/api/attendance', require('./routes/attendance.js'));
app.use('/api/admissions', require('./routes/admissions.js'));
app.use('/api/news', require('./routes/news.js'));
app.use('/api/testimonials', require('./routes/testimonials.js'));
app.use('/api/contact', require('./routes/contact.js'));
app.use('/api/gallery', require('./routes/gallery.js'));
app.use('/api/parents', require('./routes/parents.js'));
app.use('/api/activation', require('./routes/activation.js'));
app.use('/api/exam-schedules', require('./routes/exam-schedules.js'));
app.use('/api/timetables', require('./routes/timetables.js'));
app.use('/api/clearance', require('./routes/clearance.js'));
app.use('/api/student-dashboard', require('./routes/student-dashboard.js'));
app.use('/api/trash', require('./routes/trash.js'));
app.use('/api/upload', require('./routes/upload.js'));
app.use('/api/exams', require('./routes/exams.js'));
app.use('/api/announcements', require('./routes/announcements.js'));
app.use('/api/student-auth', require('./routes/student-auth.js'));
app.use('/api/backup', require('./routes/backup.js'));
app.use('/api/admission-batches', require('./routes/admission-batches.js'));
app.use('/api/exam-periods', require('./routes/exam-periods.js'));
app.use('/api/certificates', require('./routes/certificates.js'));

// --- Auto-create class_students junction table if it doesn't exist ---
// --- Auto-create activation columns if they don't exist ---
const { query } = require('./database');
(async () => {
    try {
        await query(`
            CREATE TABLE IF NOT EXISTS class_students (
                class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
                student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
                assigned_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (class_id, student_id)
            )
        `);
        console.log('class_students table ready.');
        
        // Add role, profile, and activation columns to users table if they don't exist
        try {
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'Parent'`);
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS subject TEXT`);
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS image TEXT`);
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS activationtoken VARCHAR(255)`);
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS activationexpires BIGINT`);
            await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS isactive BOOLEAN DEFAULT true`);
            console.log('User columns (role, activation, profile) ready.');
        } catch (alterErr) {
            if (!alterErr.message.includes('already exists')) {
                console.error('Error adding users columns:', alterErr.message);
            }
        }

        // Add missing columns to classes and students tables if they don't exist
        try {
            await query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS room TEXT`);
            await query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 30`);
            await query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#4e73df'`);
            await query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS students INTEGER DEFAULT 0`);
            await query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL`);
            await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS grade VARCHAR(50)`);
            await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS attendance VARCHAR(50)`);
            await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS gpa NUMERIC(3, 2)`);
            await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS remarks TEXT`);
            await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL`);
            console.log('Classes and students columns ready.');
        } catch (alterErr) {
            if (!alterErr.message.includes('already exists')) {
                console.error('Error adding classes/students columns:', alterErr.message);
            }
        }

        // Create exam_schedules table if it doesn't exist
        await query(`
            CREATE TABLE IF NOT EXISTS exam_schedules (
                id SERIAL PRIMARY KEY,
                class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
                subject TEXT NOT NULL,
                exam_date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                room TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('exam_schedules table ready.');

        // Create timetables table if it doesn't exist
        await query(`
            CREATE TABLE IF NOT EXISTS timetables (
                id SERIAL PRIMARY KEY,
                class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
                day_of_week TEXT NOT NULL,
                subject TEXT NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                room TEXT,
                teacher_name TEXT
            )
        `);
        console.log('timetables table ready.');

        // Create clearance_cards table if it doesn't exist
        await query(`
            CREATE TABLE IF NOT EXISTS clearance_cards (
                id SERIAL PRIMARY KEY,
                student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
                is_cleared BOOLEAN DEFAULT false,
                released_by TEXT,
                released_at TIMESTAMP,
                semester TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('clearance_cards table ready.');

        // Ensure results table exists with all required columns
        await query(`
            CREATE TABLE IF NOT EXISTS results (
                id SERIAL PRIMARY KEY,
                student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
                subject TEXT,
                score NUMERIC,
                exam_type TEXT DEFAULT 'score',
                max_score NUMERIC DEFAULT 100,
                approval_status TEXT DEFAULT 'approved',
                submitted_by TEXT,
                submitted_at TIMESTAMP DEFAULT NOW()
            )
        `);
        try {
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS subject TEXT`);
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS score NUMERIC`);
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS exam_type TEXT DEFAULT 'score'`);
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS max_score NUMERIC DEFAULT 100`);
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved'`);
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS submitted_by TEXT`);
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP DEFAULT NOW()`);
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS release_at TIMESTAMP DEFAULT NULL`);
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS edit_allowed BOOLEAN DEFAULT false`);
            console.log('results table columns ready.');
        } catch (alterErr) {
            if (!alterErr.message.includes('already exists')) {
                console.error('Error updating results table:', alterErr.message);
            }
        }

        // Add department column to students table if it doesn't exist
        try {
            await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS department TEXT DEFAULT '--'`);
            await query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS period TEXT DEFAULT '--'`);
            console.log('students table columns ready.');
        } catch (e) {
            if (!e.message.includes('already exists')) {
                console.error('Error adding students columns:', e.message);
            }
        }

        // Create fees table if it doesn't exist
        await query(`
            CREATE TABLE IF NOT EXISTS fees (
                id SERIAL PRIMARY KEY,
                studentid INTEGER REFERENCES students(id) ON DELETE CASCADE,
                amount NUMERIC(10,2) NOT NULL,
                duedate DATE NOT NULL,
                status TEXT DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('fees table ready.');

        // Create results table if it doesn't exist
        await query(`
            CREATE TABLE IF NOT EXISTS results (
                id SERIAL PRIMARY KEY,
                student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
                subject TEXT NOT NULL,
                score NUMERIC(5,2),
                approval_status TEXT DEFAULT 'approved',
                submitted_by TEXT,
                submitted_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('results table ready.');

        // Add approval columns to results table if they don't exist
        try {
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved'`);
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS submitted_by TEXT`);
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP DEFAULT NOW()`);
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS exam_type TEXT DEFAULT 'score'`);
            await query(`ALTER TABLE results ADD COLUMN IF NOT EXISTS max_score NUMERIC(5,2) DEFAULT 100`);
            // Drop foreign key constraint on exam_id if it exists
            try {
                const { rows: fkRows } = await query(`
                    SELECT conname FROM pg_constraint 
                    WHERE conrelid = 'results'::regclass 
                    AND contype = 'f' 
                    AND confrelid = 'exam_schedules'::regclass
                `);
                for (const fk of fkRows) {
                    await query(`ALTER TABLE results DROP CONSTRAINT ${fk.conname}`);
                    console.log(`Dropped foreign key: ${fk.conname}`);
                }
            } catch (e) { /* constraint might not exist */ }
            // Make exam_id nullable if it has NOT NULL constraint
            try {
                await query(`ALTER TABLE results ALTER COLUMN exam_id DROP NOT NULL`);
            } catch (e) { /* exam_id might already be nullable or not exist */ }
            // Set default for exam_id if it exists
            try {
                await query(`ALTER TABLE results ALTER COLUMN exam_id SET DEFAULT NULL`);
            } catch (e) { /* column might not exist */ }
            // Update existing results to approved
            await query(`UPDATE results SET approval_status = 'approved' WHERE approval_status IS NULL`);
            console.log('Results approval columns ready.');
        } catch (alterErr) {
            if (!alterErr.message.includes('already exists')) {
                console.error('Error adding results columns:', alterErr.message);
            }
        }
        // Add deleted_at columns for soft-delete to all data tables
        const softDeleteTables = ['students','users','results','fees','attendance_records','timetables','events','exam_schedules','clearance_cards','books','messages','gallery_items','content','news','classes','class_students'];
        for (const tbl of softDeleteTables) {
            try {
                await query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL`);
            } catch (e) { /* ignore */ }
        }
        console.log('Soft-delete columns ready.');

        // Create exams table (dynamic exam definitions, e.g. Quiz 1, Semester 1, ...)
        await query(`
            CREATE TABLE IF NOT EXISTS exams (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                exam_key TEXT NOT NULL UNIQUE,
                max_score NUMERIC(5,2) DEFAULT 100,
                sort_order INTEGER DEFAULT 0,
                active BOOLEAN DEFAULT true,
                deleted_at TIMESTAMP
            )
        `);
        // Seed the standard exams if the table is empty
        await query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS exam_key TEXT UNIQUE`);
        await query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_score NUMERIC(5,2) DEFAULT 100`);
        await query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`);
        await query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true`);
        await query(`ALTER TABLE exams ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`);
        // Make legacy per-class exam columns nullable so the shared exam list can be seeded
        try { await query(`ALTER TABLE exams ALTER COLUMN class_id DROP NOT NULL`); } catch (e) {}
        try { await query(`ALTER TABLE exams ALTER COLUMN class_id SET DEFAULT NULL`); } catch (e) {}
        await query(`
            INSERT INTO exams (name, exam_key, max_score, sort_order)
            VALUES
                ('Quiz 1', 'quiz1', 5, 1),
                ('Quiz 2', 'quiz2', 5, 2),
                ('Semester 1', 'sem1', 5, 3),
                ('Semester 2', 'sem2', 5, 4),
                ('Midterm', 'midterm', 40, 5),
                ('Final', 'final', 40, 6)
            ON CONFLICT (exam_key) DO NOTHING
        `).catch(e => {});
        console.log('exams table ready.');

        // Create class_exams junction table (which exams are assigned to each class)
        await query(`
            CREATE TABLE IF NOT EXISTS class_exams (
                class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
                exam_id INTEGER REFERENCES exams(id) ON DELETE CASCADE,
                assigned_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (class_id, exam_id)
            )
        `);
        console.log('class_exams table ready.');

        // Create announcements table (broadcasts shown on student dashboards)
        await query(`
            CREATE TABLE IF NOT EXISTS announcements (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                message TEXT,
                audience TEXT DEFAULT 'all',
                created_by TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                deleted_at TIMESTAMP
            )
        `);
        console.log('announcements table ready.');

        // Create student_auth table if it doesn't exist
        await query(`
            CREATE TABLE IF NOT EXISTS student_auth (
                student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
                password_hash TEXT NOT NULL,
                plain_password TEXT NOT NULL DEFAULT '',
                must_change BOOLEAN NOT NULL DEFAULT false,
                last_changed TIMESTAMP NOT NULL DEFAULT NOW(),
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);
        try {
            await query(`ALTER TABLE student_auth ADD COLUMN IF NOT EXISTS plain_password TEXT NOT NULL DEFAULT ''`);
            await query(`ALTER TABLE student_auth ADD COLUMN IF NOT EXISTS must_change BOOLEAN NOT NULL DEFAULT false`);
            await query(`ALTER TABLE student_auth ADD COLUMN IF NOT EXISTS last_changed TIMESTAMP NOT NULL DEFAULT NOW()`);
        } catch (e) {}
        console.log('student_auth table ready.');

        // Create class_attendance_locks table if it doesn't exist
        await query(`
            CREATE TABLE IF NOT EXISTS class_attendance_locks (
                id SERIAL PRIMARY KEY,
                class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                submitted_by INTEGER,
                is_locked BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(class_id, date)
            )
        `);
        console.log('class_attendance_locks table ready.');

        // Create system_backups table if it doesn't exist
        await query(`
            CREATE TABLE IF NOT EXISTS system_backups (
                id SERIAL PRIMARY KEY,
                filename TEXT UNIQUE NOT NULL,
                trigger_reason VARCHAR(100) DEFAULT 'manual',
                triggered_by VARCHAR(255) DEFAULT 'Admin',
                total_records INTEGER DEFAULT 0,
                table_stats JSONB DEFAULT '{}'::jsonb,
                backup_data JSONB NOT NULL,
                file_size_bytes BIGINT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_system_backups_created_at ON system_backups (created_at DESC)`);
        console.log('system_backups table ready.');

        // Initialize automated daily backup scheduler
        const backupService = require('./services/backupService.js');
        backupService.initAutomatedDailyBackup();
    } catch (err) {
        console.error('Error creating tables:', err.message);
    }
})();

// --- DIAGNOSTIC ROUTE: shows real column names from Supabase tables ---
app.get('/api/diagnose', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
        `);
        const tables = rows.reduce((acc, r) => {
            if (!acc[r.table_name]) acc[r.table_name] = [];
            acc[r.table_name].push({ column: r.column_name, type: r.data_type });
            return acc;
        }, {});
        res.json(tables);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- LIST ALL TABLE NAMES ---
app.get('/api/tables', async (req, res) => {
    try {
        const { rows } = await query(`
            SELECT table_name, 
                   (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') AS column_count
            FROM information_schema.tables t
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 3. Static File Serving ---

// --- 4. Auto-Release Scheduler: checks every 60s for held results whose release time has passed ---
setInterval(async () => {
    try {
        const { rows } = await query(`
            UPDATE results
            SET approval_status = 'approved'
            WHERE approval_status = 'on_hold'
              AND release_at IS NOT NULL
              AND release_at <= NOW()
            RETURNING id
        `);
        if (rows.length > 0) {
            console.log(`[Auto-Release] ${rows.length} result(s) auto-released.`);
        }
    } catch (e) {
        // ignore if column doesn't exist yet
    }
}, 60000);

// --- 5. Graceful Navigation Fallback ---
app.use((req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'Endpoint not found' });
    }
    // Never redirect static assets (.json, .js, .css, images, etc.) to index.html
    if (/\.(json|js|css|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|otf)$/i.test(req.path)) {
        return res.status(404).send('Asset not found');
    }
    // Redirect unknown web routes (like /goal or mistyped URLs) to home page
    res.redirect('/HTML/index.html');
});

// --- 6. Start the Server (local only, not on Vercel) ---
if (!process.env.VERCEL) {
    app.get('/', (req, res) => {
        res.redirect('/HTML/index.html');
    });
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\nServer is running successfully!`);
        console.log(`View on your computer at: http://localhost:3000`);
        console.log(`View on other devices on your network at: http://YOUR_IP_ADDRESS:3000`);
    });
}

module.exports = app;
