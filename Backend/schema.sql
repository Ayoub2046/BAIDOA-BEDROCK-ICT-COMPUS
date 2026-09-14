-- ==============================================================
-- Baidoa Bedrock ICT Campus — Full Database Schema
-- Database : PostgreSQL (Supabase)
-- Updated  : 2026-09-13
-- Student IDs: BB260001, BB260002, ...
-- ==============================================================

-- ---------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ---------------------------------------------------------------
-- 1. USERS  (Staff: Admin, Teacher, Parent)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                   SERIAL PRIMARY KEY,
    name                 TEXT          NOT NULL,
    email                TEXT          NOT NULL,
    password             TEXT,
    role                 VARCHAR(50)   NOT NULL DEFAULT 'Parent',
    subject              TEXT,
    image                TEXT,
    isverified           BOOLEAN       NOT NULL DEFAULT false,
    isactive             BOOLEAN       NOT NULL DEFAULT true,
    resetpasswordtoken   TEXT,
    resetpasswordexpires BIGINT,
    activationtoken      TEXT,
    activationexpires    BIGINT,
    created_at           TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP     NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMP     NULL,
    CONSTRAINT users_email_role_unique UNIQUE (email, role)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
    ON users (LOWER(email))
    WHERE role IN ('Admin','Teacher','Parent') AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- 2. SESSION
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session (
    sid    VARCHAR      NOT NULL PRIMARY KEY,
    sess   JSON         NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON session (expire);

-- ---------------------------------------------------------------
-- 3. CLASSES
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classes (
    id         SERIAL PRIMARY KEY,
    name       TEXT         NOT NULL,
    teacherid  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    room       TEXT,
    capacity   INTEGER      DEFAULT 30,
    color      VARCHAR(20)  DEFAULT '#1a7fd4',
    students   INTEGER      DEFAULT 0,
    created_at TIMESTAMP    DEFAULT NOW(),
    deleted_at TIMESTAMP    NULL
);

CREATE INDEX IF NOT EXISTS classes_teacher_idx ON classes (teacherid) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- 4. STUDENTS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id             SERIAL PRIMARY KEY,
    name           TEXT         NOT NULL,
    enrollmentdate DATE,
    birthdate      DATE,
    parentid       INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    classid        INTEGER      REFERENCES classes(id) ON DELETE SET NULL,
    image          TEXT,
    department     TEXT         DEFAULT '--',
    period         TEXT         DEFAULT '--',
    grade          VARCHAR(50),
    attendance     VARCHAR(50),
    gpa            NUMERIC(4,2),
    remarks        TEXT,
    national_id    TEXT,
    created_at     TIMESTAMP    DEFAULT NOW(),
    deleted_at     TIMESTAMP    NULL
);

CREATE INDEX IF NOT EXISTS students_classid_idx     ON students (classid)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS students_parentid_idx    ON students (parentid)    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS students_national_id_idx ON students (national_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- 5. STUDENT_AUTH  (Student login credentials — admin-managed)
--    Student ID format: BB260001 = 'BB' + LPAD(id + 260000, 6, '0')
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_auth (
    student_id    INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
    -- bcrypt-hashed password used for verification
    password_hash TEXT        NOT NULL,
    -- Admin-visible plain text stored so admin can tell students who forget
    -- NOTE: In a high-security environment this would be a one-way hash only;
    --       here we keep it per the school's operational requirement.
    plain_password TEXT       NOT NULL DEFAULT '',
    -- Force student to change password after admin reset
    must_change   BOOLEAN     NOT NULL DEFAULT false,
    last_changed  TIMESTAMP   NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 6. CLASS_STUDENTS (Junction)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_students (
    class_id    INTEGER NOT NULL REFERENCES classes(id)  ON DELETE CASCADE,
    student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT NOW(),
    deleted_at  TIMESTAMP NULL,
    PRIMARY KEY (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS cs_student_idx ON class_students (student_id);
CREATE INDEX IF NOT EXISTS cs_class_idx   ON class_students (class_id);

-- ---------------------------------------------------------------
-- 7. EXAMS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exams (
    id            SERIAL PRIMARY KEY,
    name          TEXT           NOT NULL,
    exam_key      TEXT           UNIQUE,
    class_id      INTEGER        REFERENCES classes(id) ON DELETE SET NULL,
    exam_date     DATE,
    academic_year TEXT,
    max_score     NUMERIC(6,2)   DEFAULT 100,
    sort_order    INTEGER        DEFAULT 0,
    active        BOOLEAN        DEFAULT true,
    created_at    TIMESTAMP      DEFAULT NOW(),
    updated_at    TIMESTAMP      DEFAULT NOW(),
    deleted_at    TIMESTAMP      NULL
);

-- Seed standard exam types
INSERT INTO exams (name, exam_key, max_score, sort_order) VALUES
    ('Quiz 1',     'quiz1',   5,   1),
    ('Quiz 2',     'quiz2',   5,   2),
    ('Semester 1', 'sem1',    5,   3),
    ('Semester 2', 'sem2',    5,   4),
    ('Midterm',    'midterm', 40,  5),
    ('Final',      'final',   40,  6)
ON CONFLICT (exam_key) DO NOTHING;

-- ---------------------------------------------------------------
-- 8. CLASS_EXAMS (Junction)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS class_exams (
    class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    exam_id     INTEGER NOT NULL REFERENCES exams(id)   ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (class_id, exam_id)
);

-- ---------------------------------------------------------------
-- 9. EXAM_SCHEDULES
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exam_schedules (
    id         SERIAL PRIMARY KEY,
    class_id   INTEGER  REFERENCES classes(id) ON DELETE CASCADE,
    subject    TEXT     NOT NULL,
    exam_date  DATE     NOT NULL,
    start_time TIME     NOT NULL,
    end_time   TIME     NOT NULL,
    room       TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS exam_sched_class_idx ON exam_schedules (class_id, exam_date);

-- ---------------------------------------------------------------
-- 10. RESULTS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS results (
    id              SERIAL PRIMARY KEY,
    student_id      INTEGER      NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    exam_id         INTEGER      REFERENCES exams(id) ON DELETE SET NULL,
    subject         TEXT,
    subjects        TEXT,
    score           NUMERIC(6,2),
    max_score       NUMERIC(6,2) DEFAULT 100,
    exam_type       TEXT         DEFAULT 'score',
    gpa             TEXT,
    remarks         TEXT,
    teacher_id      INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    teacher_name    TEXT,
    approval_status TEXT         DEFAULT 'approved',
    submitted_by    TEXT,
    submitted_at    TIMESTAMP    DEFAULT NOW(),
    release_at      TIMESTAMP    NULL,
    created_at      TIMESTAMP    DEFAULT NOW(),
    updated_at      TIMESTAMP    DEFAULT NOW(),
    deleted_at      TIMESTAMP    NULL
);

CREATE INDEX IF NOT EXISTS results_student_idx  ON results (student_id)       WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS results_subject_idx  ON results (student_id, subject);
CREATE INDEX IF NOT EXISTS results_approval_idx ON results (approval_status)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS results_release_idx  ON results (release_at)
    WHERE approval_status = 'on_hold' AND release_at IS NOT NULL;

-- ---------------------------------------------------------------
-- 11. ATTENDANCE_RECORDS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_records (
    id         SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id   INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    date       DATE    NOT NULL,
    status     TEXT    NOT NULL,
    notes      TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,
    UNIQUE (student_id, date)
);

CREATE INDEX IF NOT EXISTS att_student_date_idx ON attendance_records (student_id, date);
CREATE INDEX IF NOT EXISTS att_class_date_idx   ON attendance_records (class_id, date);

-- ---------------------------------------------------------------
-- 12. TIMETABLES
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timetables (
    id           SERIAL PRIMARY KEY,
    class_id     INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    day_of_week  TEXT    NOT NULL,
    subject      TEXT    NOT NULL,
    start_time   TIME    NOT NULL,
    end_time     TIME    NOT NULL,
    room         TEXT,
    teacher_name TEXT,
    deleted_at   TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS tt_class_day_idx ON timetables (class_id, day_of_week);

-- ---------------------------------------------------------------
-- 13. FEES
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fees (
    id         SERIAL PRIMARY KEY,
    studentid  INTEGER        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    amount     NUMERIC(10,2)  NOT NULL DEFAULT 0,
    duedate    DATE,
    status     TEXT           DEFAULT 'Pending',
    created_at TIMESTAMP      DEFAULT NOW(),
    deleted_at TIMESTAMP      NULL
);

CREATE INDEX IF NOT EXISTS fees_student_idx ON fees (studentid) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS fees_status_idx  ON fees (status)    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- 14. CLEARANCE_CARDS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clearance_cards (
    id          SERIAL PRIMARY KEY,
    student_id  INTEGER REFERENCES students(id) ON DELETE CASCADE,
    is_cleared  BOOLEAN   DEFAULT false,
    released_by TEXT,
    released_at TIMESTAMP NULL,
    semester    TEXT,
    created_at  TIMESTAMP DEFAULT NOW(),
    deleted_at  TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS clearance_student_idx ON clearance_cards (student_id);

-- ---------------------------------------------------------------
-- 15. APPLICATIONS (Admissions)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS applications (
    id                      SERIAL PRIMARY KEY,
    name                    TEXT    NOT NULL,
    birthdate               DATE,
    birth_date              DATE,
    grade_to_enroll         TEXT,
    previous_school         TEXT,
    parent_name             TEXT,
    parent_email            TEXT,
    parent_phone            TEXT,
    application_letter_path TEXT,
    applicantimagepath      TEXT,
    status                  TEXT    NOT NULL DEFAULT 'Pending',
    submission_date         TIMESTAMP,
    created_at              TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW(),
    deleted_at              TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS apps_status_idx ON applications (status) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- 16. ANNOUNCEMENTS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
    id           SERIAL PRIMARY KEY,
    title        TEXT  NOT NULL,
    message      TEXT,
    audience     TEXT  DEFAULT 'all',
    created_by   TEXT,
    image_url    TEXT,
    publish_date DATE DEFAULT CURRENT_DATE,
    created_at   TIMESTAMP DEFAULT NOW(),
    deleted_at   TIMESTAMP NULL
);

-- ---------------------------------------------------------------
-- 17. MESSAGES
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id         SERIAL PRIMARY KEY,
    channel_id TEXT    NOT NULL,
    sender     TEXT,
    subject    TEXT,
    body       TEXT    NOT NULL,
    time       TEXT,
    is_read    BOOLEAN NOT NULL DEFAULT false,
    attachment TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS messages_channel_idx ON messages (channel_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- 18. CONTACT_MESSAGES
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_messages (
    id              SERIAL PRIMARY KEY,
    first_name      TEXT    NOT NULL,
    last_name       TEXT,
    email           TEXT    NOT NULL,
    subject         TEXT,
    message         TEXT    NOT NULL,
    submission_date TIMESTAMP,
    is_read         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMP DEFAULT NOW(),
    deleted_at      TIMESTAMP NULL
);

-- ---------------------------------------------------------------
-- 19. NEWS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news (
    id           SERIAL PRIMARY KEY,
    title        TEXT    NOT NULL,
    summary      TEXT,
    image_url    TEXT,
    content      TEXT,
    publish_date TIMESTAMP,
    is_published BOOLEAN DEFAULT true,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW(),
    deleted_at   TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS news_published_idx ON news (is_published, publish_date) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- 20. EVENTS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id              SERIAL PRIMARY KEY,
    title           TEXT,
    start           TIMESTAMP,
    "end"           TIMESTAMP,
    backgroundcolor TEXT,
    bordercolor     TEXT,
    image           TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    deleted_at      TIMESTAMP NULL
);

-- ---------------------------------------------------------------
-- 21. BOOKS (Library)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS books (
    id           SERIAL PRIMARY KEY,
    title        TEXT,
    author       TEXT,
    isbn         TEXT,
    category     TEXT,
    checkedoutto TEXT,
    digitallink  TEXT,
    created_at   TIMESTAMP DEFAULT NOW(),
    deleted_at   TIMESTAMP NULL
);

-- ---------------------------------------------------------------
-- 22. GALLERY_ITEMS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gallery_items (
    id          SERIAL PRIMARY KEY,
    title       TEXT  NOT NULL,
    description TEXT,
    type        TEXT,
    media_url   TEXT,
    category    TEXT,
    upload_date TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),
    deleted_at  TIMESTAMP NULL
);

-- ---------------------------------------------------------------
-- 23. TESTIMONIALS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS testimonials (
    id         SERIAL PRIMARY KEY,
    quote      TEXT NOT NULL,
    author     TEXT NOT NULL,
    relation   TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

-- ---------------------------------------------------------------
-- 24. CMS CONTENT
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

-- ---------------------------------------------------------------
-- 25. APP_SETTINGS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES
    ('school_name',     'Baidoa Bedrock ICT Campus'),
    ('school_short',    'BBICT'),
    ('school_motto',    'Empowering minds, shaping the futures'),
    ('school_email',    'info@bbict.edu.so'),
    ('school_phone',    '+252 61 1234567'),
    ('school_address',  'Baidoa, Bay Region, Somalia'),
    ('academic_year',   '2026-2027'),
    ('results_visible', 'true'),
    ('theme_color',     '#1a7fd4'),
    ('accent_color',    '#f5a623'),
    ('student_id_prefix', 'BB'),
    ('student_id_offset', '260000')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- ---------------------------------------------------------------
-- 26. REPORTS
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
    id         SERIAL PRIMARY KEY,
    type       TEXT         NOT NULL,
    class_id   INTEGER      REFERENCES classes(id) ON DELETE SET NULL,
    period     TEXT,
    data       JSONB,
    created_by TEXT,
    created_at TIMESTAMP    DEFAULT NOW(),
    deleted_at TIMESTAMP    NULL
);

-- ---------------------------------------------------------------
-- HELPER: Generate BB Student ID from numeric student id
-- Usage: SELECT bb_student_id(1); -> 'BB260001'
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION bb_student_id(p_id INTEGER)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT 'BB' || LPAD((260000 + p_id)::TEXT, 6, '0');
$$;

-- ---------------------------------------------------------------
-- AUTO UPDATED_AT TRIGGER
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'users','students','classes','results','exams',
        'news','gallery_items','testimonials','content',
        'app_settings','applications','reports'
    ] LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;
            CREATE TRIGGER trg_%s_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        ', tbl, tbl, tbl, tbl);
    END LOOP;
END;
$$;

-- ---------------------------------------------------------------
-- ENSURE student_auth table has right columns (safe migration)
-- ---------------------------------------------------------------
ALTER TABLE IF EXISTS student_auth ADD COLUMN IF NOT EXISTS plain_password TEXT NOT NULL DEFAULT '';
ALTER TABLE IF EXISTS student_auth ADD COLUMN IF NOT EXISTS must_change BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS student_auth ADD COLUMN IF NOT EXISTS last_changed TIMESTAMP NOT NULL DEFAULT NOW();

-- ---------------------------------------------------------------
-- VIEWS
-- ---------------------------------------------------------------

CREATE OR REPLACE VIEW v_students_with_class AS
SELECT
    s.id,
    s.name,
    bb_student_id(s.id) AS bb_id,
    s.grade,
    s.gpa,
    s.department,
    s.period,
    s.image,
    s.national_id,
    s.classid,
    c.name  AS class_name,
    c.teacherid,
    u.name  AS teacher_name,
    s.parentid,
    s.deleted_at
FROM students s
LEFT JOIN classes c ON c.id = s.classid
LEFT JOIN users   u ON u.id = c.teacherid
WHERE s.deleted_at IS NULL;


CREATE OR REPLACE VIEW v_approved_results AS
SELECT
    r.id, r.student_id,
    s.name  AS student_name,
    bb_student_id(s.id) AS bb_id,
    s.classid,
    r.subject, r.exam_type, r.score, r.max_score,
    r.remarks, r.teacher_name, r.submitted_at, r.approval_status
FROM results r
JOIN students s ON s.id = r.student_id
WHERE r.approval_status = 'approved'
  AND r.deleted_at IS NULL;


CREATE OR REPLACE VIEW v_class_leaders AS
WITH totals AS (
    SELECT
        r.student_id,
        SUM(r.score) AS total_score
    FROM results r
    WHERE r.approval_status = 'approved' AND r.deleted_at IS NULL
    GROUP BY r.student_id
)
SELECT
    s.id        AS student_id,
    bb_student_id(s.id) AS bb_id,
    s.name      AS student_name,
    s.image,
    c.id        AS class_id,
    c.name      AS class_name,
    t.total_score,
    RANK() OVER (PARTITION BY c.id ORDER BY t.total_score DESC) AS rank
FROM totals   t
JOIN students s ON s.id = t.student_id AND s.deleted_at IS NULL
JOIN classes  c ON c.id = s.classid    AND c.deleted_at IS NULL;

-- ---------------------------------------------------------------
-- 26. SYSTEM BACKUPS (Database Snapshot Archive)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_backups (
    id               SERIAL PRIMARY KEY,
    filename         TEXT UNIQUE NOT NULL,
    trigger_reason   VARCHAR(100) DEFAULT 'manual',
    triggered_by     VARCHAR(255) DEFAULT 'Admin',
    total_records    INTEGER DEFAULT 0,
    table_stats      JSONB DEFAULT '{}'::jsonb,
    backup_data      JSONB NOT NULL,
    file_size_bytes  BIGINT DEFAULT 0,
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_system_backups_created_at ON system_backups (created_at DESC);

-- ==============================================================
-- END OF SCHEMA
-- ==============================================================

