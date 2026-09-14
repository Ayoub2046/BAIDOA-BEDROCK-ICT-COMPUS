// Backend/services/backupService.js
// Enterprise Backup & Recovery Engine for Baidoa Bedrock ICT Campus
// Supports: Automated daily backups, on-demand snapshots, pre-wipe safety snapshots,
//           backup download, full data restoration, and safe factory reset.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { query, pool } = require('../database.js');

// Root backup directory
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');

// Ensure backups directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    try {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    } catch (e) {
        console.error('Error creating backups directory:', e.message);
    }
}

// Ordered tables for backup and clean restore
const SYSTEM_TABLES = [
    'app_settings',
    'users',
    'classes',
    'students',
    'student_auth',
    'class_students',
    'exams',
    'class_exams',
    'exam_schedules',
    'results',
    'attendance_records',
    'class_attendance_locks',
    'timetables',
    'fees',
    'clearance_cards',
    'applications',
    'announcements',
    'messages',
    'contact_messages',
    'news',
    'events',
    'books',
    'gallery_items',
    'testimonials',
    'content',
    'reports'
];

// Operational tables that get cleared on "Start from Scratch"
// (Preserves app_settings, news, gallery_items, events, books, content, and Admin users)
const OPERATIONAL_TABLES = [
    'attendance_records',
    'class_attendance_locks',
    'results',
    'fees',
    'clearance_cards',
    'exam_schedules',
    'timetables',
    'class_students',
    'student_auth',
    'students',
    'class_exams',
    'classes',
    'applications',
    'announcements',
    'messages',
    'contact_messages',
    'reports'
];

/**
 * Format timestamp for backup filenames (e.g. 2026-09-14_08-00-00)
 */
function getTimestampSlug(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

/**
 * Creates a full JSON snapshot of all system tables.
 * @param {string} triggerReason - 'daily_auto', 'manual', 'pre_wipe', 'api'
 * @param {string} triggeredBy - User name or 'System'
 */
async function createFullBackup(triggerReason = 'manual', triggeredBy = 'Admin') {
    const startTime = Date.now();
    const backupData = {
        meta: {
            version: '2.0',
            institution: 'Baidoa Bedrock ICT Campus',
            createdAt: new Date().toISOString(),
            triggerReason,
            triggeredBy,
            tableStats: {},
            totalRecords: 0
        },
        tables: {}
    };

    for (const table of SYSTEM_TABLES) {
        try {
            const { rows } = await query(`SELECT * FROM ${table}`);
            backupData.tables[table] = rows || [];
            backupData.meta.tableStats[table] = (rows || []).length;
            backupData.meta.totalRecords += (rows || []).length;
        } catch (err) {
            // If a table doesn't exist yet, store empty array
            backupData.tables[table] = [];
            backupData.meta.tableStats[table] = 0;
        }
    }

    const filename = `backup_${getTimestampSlug()}_${triggerReason}.json`;
    const filePath = path.join(BACKUP_DIR, filename);

    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf8');

    const fileStats = fs.statSync(filePath);
    const durationMs = Date.now() - startTime;

    console.log(`[BackupService] Snapshot created: ${filename} (${backupData.meta.totalRecords} records, ${Math.round(fileStats.size / 1024)} KB) in ${durationMs}ms`);

    return {
        id: filename,
        filename,
        path: filePath,
        sizeBytes: fileStats.size,
        sizeFormatted: formatBytes(fileStats.size),
        createdAt: backupData.meta.createdAt,
        triggerReason,
        triggeredBy,
        totalRecords: backupData.meta.totalRecords,
        tableStats: backupData.meta.tableStats,
        durationMs
    };
}

/**
 * List all saved backups in the backups/ directory
 */
function listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];

    const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.json') && f.startsWith('backup_'))
        .sort((a, b) => b.localeCompare(a)); // Newest first

    return files.map(file => {
        const filePath = path.join(BACKUP_DIR, file);
        try {
            const stats = fs.statSync(filePath);
            // Quick read first 1KB to parse metadata safely without loading entire huge JSON
            let meta = {};
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const parsed = JSON.parse(content);
                meta = parsed.meta || {};
            } catch (e) {}

            return {
                filename: file,
                sizeBytes: stats.size,
                sizeFormatted: formatBytes(stats.size),
                createdAt: meta.createdAt || stats.mtime.toISOString(),
                triggerReason: meta.triggerReason || 'snapshot',
                triggeredBy: meta.triggeredBy || 'System',
                totalRecords: meta.totalRecords !== undefined ? meta.totalRecords : null,
                tableStats: meta.tableStats || {}
            };
        } catch (e) {
            return null;
        }
    }).filter(Boolean);
}

/**
 * Get the absolute file path for a backup
 */
function getBackupFilePath(filename) {
    // Sanitize filename to prevent directory traversal
    const safeName = path.basename(filename);
    const fullPath = path.join(BACKUP_DIR, safeName);
    if (!fs.existsSync(fullPath)) return null;
    return fullPath;
}

/**
 * Restore database from a backup JSON payload or file.
 * Safely handles dependencies, cleans target tables, and repopulates them.
 */
async function restoreBackup(backupPayload) {
    if (!backupPayload || !backupPayload.tables) {
        throw new Error('Invalid backup data format. Expected "tables" object.');
    }

    const { tables, meta } = backupPayload;
    console.log(`[BackupService] Restoring database from backup created at ${meta?.createdAt || 'unknown'}...`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Temporarily disable foreign key triggers if supported, or delete in reverse topological order
        for (const table of OPERATIONAL_TABLES) {
            try {
                await client.query(`DELETE FROM ${table}`);
            } catch (e) {}
        }

        // 2. Also clean non-admin users so we can restore the exact user set
        try {
            await client.query(`DELETE FROM users WHERE role != 'Admin'`);
        } catch (e) {}

        // 3. Restore tables in forward dependency order
        let totalRestored = 0;

        for (const table of SYSTEM_TABLES) {
            const rows = tables[table];
            if (!Array.isArray(rows) || rows.length === 0) continue;

            for (const row of rows) {
                // For users, don't duplicate existing Admin if conflict
                if (table === 'users' && row.email) {
                    const existing = await client.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`, [row.email]);
                    if (existing.rows.length > 0) {
                        continue;
                    }
                }

                // For app_settings, do an UPSERT
                if (table === 'app_settings') {
                    await client.query(
                        `INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                        [row.key, row.value]
                    );
                    continue;
                }

                const keys = Object.keys(row);
                if (keys.length === 0) continue;

                const cols = keys.map(k => `"${k}"`).join(', ');
                const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
                const values = keys.map(k => row[k]);

                const insertSql = `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
                try {
                    await client.query(insertSql, values);
                    totalRestored++;
                } catch (rowErr) {
                    // Ignore minor schema drift or foreign key skips
                }
            }

            // Sync serial sequence after restoring table
            try {
                await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`);
            } catch (e) {}
        }

        await client.query('COMMIT');
        console.log(`[BackupService] Restore complete. Restored ${totalRestored} records.`);

        return {
            success: true,
            totalRestored,
            restoredFrom: meta?.createdAt || 'Snapshot'
        };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[BackupService] Restore failed, rolled back:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Clear All System Data ("Start from Scratch")
 *
 * CRITICAL SAFETY RULES:
 * 1. MANDATORY: Automatically creates a full pre-wipe backup snapshot BEFORE touching anything!
 * 2. Wipes all operational records (students, attendance, results, fees, clearance, messages, classes).
 * 3. PRESERVES Admin account and site configuration so Admin remains logged in.
 * 4. Re-seeds standard exam types and ensures sequences are reset.
 */
async function clearSystemData(adminUserId = null) {
    console.log('[BackupService] INITIATING SYSTEM DATA CLEAR (Start from Scratch)...');

    // 1. MANDATORY SAFETY SNAPSHOT BEFORE WIPE
    const preWipeBackup = await createFullBackup('pre_wipe', 'Admin (Pre-Wipe Safety Snapshot)');
    console.log(`[BackupService] Safety snapshot successfully saved to: ${preWipeBackup.filename}`);

    const client = await pool.connect();
    const wipeStats = {};

    try {
        await client.query('BEGIN');

        // Clear operational tables using SAVEPOINTs so a single table failure
        // does NOT abort the entire transaction block (PostgreSQL requirement)
        for (const table of OPERATIONAL_TABLES) {
            await client.query(`SAVEPOINT sp_${table.replace(/[^a-z0-9]/gi, '_')}`);
            try {
                const countRes = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
                const count = parseInt(countRes.rows[0]?.count) || 0;
                await client.query(`DELETE FROM ${table}`);
                wipeStats[table] = count;
                console.log(`[BackupService] Cleared ${count} rows from ${table}`);
                // Reset ID sequence (best-effort)
                await client.query(`SAVEPOINT sp_seq_${table.replace(/[^a-z0-9]/gi, '_')}`);
                try {
                    await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), 1, false)`);
                } catch (e) {
                    await client.query(`ROLLBACK TO SAVEPOINT sp_seq_${table.replace(/[^a-z0-9]/gi, '_')}`);
                }
                await client.query(`RELEASE SAVEPOINT sp_seq_${table.replace(/[^a-z0-9]/gi, '_')}`);
            } catch (tableErr) {
                console.warn(`[BackupService] Could not clear ${table}: ${tableErr.message} — rolling back to savepoint`);
                await client.query(`ROLLBACK TO SAVEPOINT sp_${table.replace(/[^a-z0-9]/gi, '_')}`);
                wipeStats[table] = 0;
            }
            await client.query(`RELEASE SAVEPOINT sp_${table.replace(/[^a-z0-9]/gi, '_')}`);
        }

        // Delete non-admin staff users (preserve Admin accounts so admin is not locked out)
        await client.query('SAVEPOINT sp_non_admin_users');
        try {
            const userCountRes = await client.query(`SELECT COUNT(*) as count FROM users WHERE role != 'Admin'`);
            wipeStats['non_admin_users'] = parseInt(userCountRes.rows[0]?.count) || 0;
            await client.query(`DELETE FROM users WHERE role != 'Admin'`);
        } catch (e) {
            console.warn('[BackupService] Could not delete non-admin users:', e.message);
            await client.query('ROLLBACK TO SAVEPOINT sp_non_admin_users');
        }
        await client.query('RELEASE SAVEPOINT sp_non_admin_users');

        // Ensure at least one primary admin account exists
        await client.query('SAVEPOINT sp_admin_seed');
        try {
            const adminCheck = await client.query(`SELECT id, email FROM users WHERE role = 'Admin' AND deleted_at IS NULL LIMIT 1`);
            if (adminCheck.rows.length === 0) {
                const hash = await bcrypt.hash('admin123', 10);
                await client.query(`
                    INSERT INTO users (name, email, password, role, isverified, isactive)
                    VALUES ('System Administrator', 'admin@bbict.edu.so', $1, 'Admin', true, true)
                    ON CONFLICT (email) DO NOTHING
                `, [hash]);
                console.log('[BackupService] Seeded default administrator account (admin@bbict.edu.so).');
            }
        } catch (e) {
            console.warn('[BackupService] Admin seed check failed:', e.message);
            await client.query('ROLLBACK TO SAVEPOINT sp_admin_seed');
        }
        await client.query('RELEASE SAVEPOINT sp_admin_seed');

        // Re-seed standard 3-part exam definitions
        await client.query('SAVEPOINT sp_exam_seed');
        try {
            await client.query(`
                INSERT INTO exams (name, exam_key, max_score, sort_order, active) VALUES
                    ('Quiz', 'quiz', 20, 1, true),
                    ('Assignment', 'assignment', 20, 2, true),
                    ('Final Exam', 'final', 60, 3, true)
                ON CONFLICT (exam_key) DO UPDATE SET max_score = EXCLUDED.max_score, active = true
            `);
        } catch (e) {
            await client.query('ROLLBACK TO SAVEPOINT sp_exam_seed');
        }
        await client.query('RELEASE SAVEPOINT sp_exam_seed');

        await client.query('COMMIT');
        console.log('[BackupService] SYSTEM DATA RESET COMPLETE. All tables cleared and ready for scratch start.');

        return {
            success: true,
            safetyBackup: preWipeBackup,
            wipeStats,
            timestamp: new Date().toISOString()
        };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[BackupService] Wipe failed, transaction rolled back:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Get current system table counts (live stats for dashboard)
 */
async function getSystemStats() {
    const stats = {};
    for (const table of SYSTEM_TABLES) {
        try {
            const { rows } = await query(`SELECT COUNT(*) as count FROM ${table}`);
            stats[table] = parseInt(rows[0]?.count) || 0;
        } catch (e) {
            stats[table] = 0;
        }
    }
    return stats;
}

/**
 * Format bytes to readable string (e.g. 2.4 MB)
 */
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Automated Daily Backup Scheduler
 * Runs once per day (checks every hour or on startup)
 */
let dailySchedulerInitialized = false;
function initAutomatedDailyBackup() {
    if (dailySchedulerInitialized) return;
    dailySchedulerInitialized = true;

    console.log('[BackupService] Initializing automated daily backup scheduler...');

    async function checkAndRunDailyBackup() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const backups = listBackups();
            const hasBackupToday = backups.some(b => b.filename.includes(today) && b.triggerReason === 'daily_auto');

            if (!hasBackupToday) {
                console.log(`[BackupService] No automated daily backup found for ${today}. Generating daily snapshot now...`);
                await createFullBackup('daily_auto', 'System Scheduler (Daily Auto-Backup)');
            }
        } catch (err) {
            console.error('[BackupService] Error in daily backup routine:', err.message);
        }
    }

    // Run check 15 seconds after startup
    setTimeout(checkAndRunDailyBackup, 15000);

    // Check periodically every 2 hours
    setInterval(checkAndRunDailyBackup, 2 * 60 * 60 * 1000);
}

module.exports = {
    createFullBackup,
    listBackups,
    getBackupFilePath,
    restoreBackup,
    clearSystemData,
    getSystemStats,
    initAutomatedDailyBackup,
    BACKUP_DIR
};
