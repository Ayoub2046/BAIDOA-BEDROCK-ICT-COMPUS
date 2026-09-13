// Backend/routes/reports.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

router.get('/', async (req, res) => {
    const { type } = req.query;

    try {
        if (type === 'financial_overview') {
            const { rows } = await query(`
                SELECT status, SUM(amount) as "totalAmount"
                FROM fees
                GROUP BY status
            `);
            const reportData = {
                labels: rows.map(r => r.status),
                datasets: [{
                    label: 'Fee Status',
                    data: rows.map(r => r.totalAmount),
                    backgroundColor: ['#1cc88a', '#e74a3b', '#f6c23e'],
                    hoverOffset: 4
                }]
            };
            res.json(reportData);

        } else if (type === 'student_enrollment') {
            const { rows } = await query(`SELECT grade, COUNT(id) as "studentCount" FROM students GROUP BY grade`);
            const reportData = {
                labels: rows.map(r => r.grade),
                datasets: [{
                    label: 'Number of Students',
                    data: rows.map(r => r.studentCount),
                    backgroundColor: '#4e73df'
                }]
            };
            res.json(reportData);

        } else {
            res.status(400).json({ error: 'Invalid report type specified.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;