// Backend/routes/reports.js — Advanced Report Generation

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

// ─── Helper: build WHERE clause for date range ───────────────────────────────
function buildDateWhere(table, col, year, month) {
    const parts = [];
    if (year && year !== 'all') parts.push(`EXTRACT(YEAR FROM ${table}.${col}) = ${parseInt(year)}`);
    if (month && month !== 'all') parts.push(`EXTRACT(MONTH FROM ${table}.${col}) = ${parseInt(month)}`);
    return parts.length ? 'AND ' + parts.join(' AND ') : '';
}

// ─── GET /api/reports ─────────────────────────────────────────────────────────
// Query params: type, year, month, status, format (json|csv|excel)
router.get('/', async (req, res) => {
    const { type, year, month, status, format } = req.query;

    try {
        // ── 1. FINANCIAL REPORT ──────────────────────────────────────────────
        if (type === 'financial') {
            let where = `WHERE f.deleted_at IS NULL`;
            const params = [];
            let idx = 1;

            if (year && year !== 'all') { where += ` AND EXTRACT(YEAR FROM f.duedate) = $${idx++}`; params.push(parseInt(year)); }
            if (month && month !== 'all') { where += ` AND EXTRACT(MONTH FROM f.duedate) = $${idx++}`; params.push(parseInt(month)); }
            if (status && status !== 'all') { where += ` AND LOWER(f.status) = $${idx++}`; params.push(status.toLowerCase()); }

            const { rows } = await query(`
                SELECT
                    s.name AS student_name,
                    COALESCE(s.student_id_code, 'BB' || (260000 + s.id)) AS student_id,
                    s.grade,
                    f.id AS fee_id,
                    f.amount,
                    f.status,
                    f.duedate,
                    COALESCE(f.duedate, f.created_at) AS paiddate
                FROM fees f
                JOIN students s ON s.id = f.studentid
                ${where}
                ORDER BY f.duedate DESC, s.name ASC
            `, params);

            // Summary totals per status
            const totals = rows.reduce((acc, r) => {
                const st = (r.status || 'unknown').toLowerCase();
                acc[st] = (acc[st] || 0) + parseFloat(r.amount || 0);
                return acc;
            }, {});

            if (format === 'csv') return sendCSV(res, rows, 'financial_report');
            if (format === 'excel') return sendExcel(res, rows, 'financial_report');

            return res.json({ rows, totals, count: rows.length });

        // ── 2. ENROLLMENT REPORT ─────────────────────────────────────────────
        } else if (type === 'enrollment') {
            let where = `WHERE s.deleted_at IS NULL`;
            const params = [];
            let idx = 1;

            if (year && year !== 'all') { where += ` AND s.academic_year = $${idx++}`; params.push(year); }
            if (month && month !== 'all') { where += ` AND EXTRACT(MONTH FROM s.enrollmentdate) = $${idx++}`; params.push(parseInt(month)); }
            if (status && status !== 'all') { where += ` AND LOWER(s.status) = $${idx++}`; params.push(status.toLowerCase()); }

            const { rows } = await query(`
                SELECT
                    s.id,
                    COALESCE(s.student_id_code, 'BB' || (260000 + s.id)) AS student_id,
                    s.name AS student_name,
                    s.grade,
                    s.status,
                    s.academic_year,
                    s.enrollmentdate,
                    s.phone,
                    COALESCE(u.name, '—') AS parent_name
                FROM students s
                LEFT JOIN users u ON u.id = s.parentid
                ${where}
                ORDER BY s.enrollmentdate DESC, s.name ASC
            `, params);

            // Group by grade for summary
            const byGrade = rows.reduce((acc, r) => {
                const g = r.grade || 'Unknown';
                acc[g] = (acc[g] || 0) + 1;
                return acc;
            }, {});

            if (format === 'csv') return sendCSV(res, rows, 'enrollment_report');
            if (format === 'excel') return sendExcel(res, rows, 'enrollment_report');

            return res.json({ rows, byGrade, count: rows.length });

        // ── 3. ATTENDANCE REPORT ─────────────────────────────────────────────
        } else if (type === 'attendance') {
            let where = `WHERE 1=1`;
            const params = [];
            let idx = 1;

            if (year && year !== 'all') { where += ` AND EXTRACT(YEAR FROM a.date) = $${idx++}`; params.push(parseInt(year)); }
            if (month && month !== 'all') { where += ` AND EXTRACT(MONTH FROM a.date) = $${idx++}`; params.push(parseInt(month)); }
            if (status && status !== 'all') { where += ` AND LOWER(a.status) = $${idx++}`; params.push(status.toLowerCase()); }

            const { rows } = await query(`
                SELECT
                    COALESCE(s.student_id_code, 'BB' || (260000 + s.id)) AS student_id,
                    s.name AS student_name,
                    s.grade,
                    a.date,
                    a.status
                FROM attendance_records a
                JOIN students s ON s.id = a.student_id
                ${where}
                ORDER BY a.date DESC, s.name ASC
            `, params);

            if (format === 'csv') return sendCSV(res, rows, 'attendance_report');
            if (format === 'excel') return sendExcel(res, rows, 'attendance_report');

            const byStatus = rows.reduce((acc, r) => { const st = r.status || 'unknown'; acc[st] = (acc[st] || 0) + 1; return acc; }, {});
            return res.json({ rows, byStatus, count: rows.length });

        // ── 4. SUMMARY (chart data for dashboard) ────────────────────────────
        } else if (type === 'summary') {
            const [fees, students, teachers] = await Promise.all([
                query(`SELECT status, COUNT(*) AS cnt, COALESCE(SUM(amount),0) AS total FROM fees GROUP BY status`),
                query(`SELECT grade, COUNT(*) AS cnt FROM students WHERE deleted_at IS NULL GROUP BY grade ORDER BY grade`),
                query(`SELECT COUNT(*) AS cnt FROM teachers WHERE deleted_at IS NULL`)
            ]);
            return res.json({
                fees: fees.rows,
                enrollment: students.rows,
                teacherCount: parseInt(teachers.rows[0]?.cnt || 0)
            });

        } else {
            res.status(400).json({ error: 'Invalid report type. Use: financial, enrollment, attendance, summary' });
        }

    } catch (err) {
        console.error('[Reports API]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── CSV Export Helper ────────────────────────────────────────────────────────
function sendCSV(res, rows, filename) {
    if (!rows || rows.length === 0) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        return res.send('No data found for selected filters.\n');
    }
    const headers = Object.keys(rows[0]);
    const escape = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
        return s;
    };
    const csvLines = [
        headers.join(','),
        ...rows.map(r => headers.map(h => escape(r[h])).join(','))
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\uFEFF' + csvLines.join('\r\n')); // BOM for Excel UTF-8 compatibility
}

// ─── Excel (TSV as .xls) Export Helper ───────────────────────────────────────
function sendExcel(res, rows, filename) {
    if (!rows || rows.length === 0) {
        res.setHeader('Content-Type', 'application/vnd.ms-excel');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.xls"`);
        return res.send('No data found for selected filters.');
    }
    const headers = Object.keys(rows[0]);
    const escape = (v) => {
        if (v === null || v === undefined) return '';
        return String(v).replace(/\t/g, ' ');
    };
    const lines = [
        headers.join('\t'),
        ...rows.map(r => headers.map(h => escape(r[h])).join('\t'))
    ];
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}_${new Date().toISOString().split('T')[0]}.xls"`);
    res.send('\uFEFF' + lines.join('\r\n'));
}

module.exports = router;