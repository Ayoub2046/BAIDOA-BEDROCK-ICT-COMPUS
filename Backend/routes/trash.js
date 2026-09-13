const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// Allowed tables for trash operations
const ALLOWED = ['students','users','results','fees','attendance_records','timetables','events','exam_schedules','clearance_cards','books','messages','gallery_items','content','news','classes','class_students'];

const DISPLAY_NAMES = {
    students: 'Students',
    users: 'Users',
    results: 'Results',
    fees: 'Fees',
    attendance_records: 'Attendance Records',
    timetables: 'Timetables',
    events: 'Events',
    exam_schedules: 'Exam Schedules',
    clearance_cards: 'Clearance Cards',
    books: 'Books',
    messages: 'Messages',
    gallery_items: 'Gallery Items',
    content: 'Content',
    news: 'News'
};

// GET /api/trash - return all soft-deleted items grouped by table
router.get('/', async (req, res) => {
    try {
        const result = {};
        for (const table of ALLOWED) {
            const { rows } = await query(
                `SELECT * FROM ${table} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`
            ).catch(() => ({ rows: [] }));
            if (rows.length > 0) {
                result[table] = {
                    display: DISPLAY_NAMES[table] || table,
                    count: rows.length,
                    items: rows
                };
            }
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/trash/restore/:table/:id - restore a single item
router.post('/restore/:table/:id', async (req, res) => {
    const { table, id } = req.params;
    if (!ALLOWED.includes(table)) return res.status(400).json({ error: 'Invalid table' });
    try {
        await query(`UPDATE ${table} SET deleted_at = NULL WHERE id = $1`, [id]);
        res.json({ message: 'Item restored successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/trash/restore-all/:table - restore all deleted items in a table
router.post('/restore-all/:table', async (req, res) => {
    const { table } = req.params;
    if (!ALLOWED.includes(table)) return res.status(400).json({ error: 'Invalid table' });
    try {
        const { rowCount } = await query(`UPDATE ${table} SET deleted_at = NULL WHERE deleted_at IS NOT NULL`);
        res.json({ message: `${rowCount} item(s) restored.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/trash/restore-all - restore all deleted items across all tables
router.post('/restore-all', async (req, res) => {
    try {
        let total = 0;
        for (const table of ALLOWED) {
            const { rowCount } = await query(`UPDATE ${table} SET deleted_at = NULL WHERE deleted_at IS NOT NULL`).catch(() => ({ rowCount: 0 }));
            total += rowCount;
        }
        res.json({ message: `${total} item(s) restored across all tables.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/trash/empty/:table - permanently delete all soft-deleted items in a table
router.delete('/empty/:table', async (req, res) => {
    const { table } = req.params;
    if (!ALLOWED.includes(table)) return res.status(400).json({ error: 'Invalid table' });
    try {
        const { rowCount } = await query(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL`);
        res.json({ message: `${rowCount} item(s) permanently deleted.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/trash/empty - permanently delete ALL soft-deleted items from all tables
router.delete('/empty', async (req, res) => {
    try {
        let total = 0;
        for (const table of ALLOWED) {
            const { rowCount } = await query(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL`).catch(() => ({ rowCount: 0 }));
            total += rowCount;
        }
        res.json({ message: `${total} item(s) permanently deleted from all tables.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/trash/soft-delete-all/:table - soft-delete ALL items in a table
router.post('/soft-delete-all/:table', async (req, res) => {
    const { table } = req.params;
    if (!ALLOWED.includes(table)) return res.status(400).json({ error: 'Invalid table' });
    try {
        const { rowCount } = await query(`UPDATE ${table} SET deleted_at = NOW() WHERE deleted_at IS NULL`);
        res.json({ message: `${rowCount} item(s) moved to trash.`, count: rowCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/trash/item/:table/:id - permanently delete a single soft-deleted item
router.delete('/item/:table/:id', async (req, res) => {
    const { table, id } = req.params;
    if (!ALLOWED.includes(table)) return res.status(400).json({ error: 'Invalid table' });
    try {
        const { rowCount } = await query(`DELETE FROM ${table} WHERE id = $1 AND deleted_at IS NOT NULL`, [id]);
        if (rowCount === 0) return res.status(404).json({ error: 'Item not found in trash.' });
        res.json({ message: 'Item permanently deleted.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
