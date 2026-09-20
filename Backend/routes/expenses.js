// Backend/routes/expenses.js
// School Expenses Management (Teacher Fees, Rent, Electricity, Water, Utilities, Supplies)

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

const EXPENSE_CATEGORIES = {
    'teacher_fee': 'Teacher Fee / Salary',
    'rent': 'School Campus Rent',
    'electricity': 'Electricity Bill',
    'water': 'Water Utility',
    'internet': 'Internet & Wi-Fi',
    'maintenance': 'Maintenance & Repairs',
    'supplies': 'Office Supplies & Books',
    'other': 'Other School Expenses'
};

// GET /api/expenses - List all expenses with filters
router.get('/', async (req, res) => {
    try {
        const { category, status, teacherId, startDate, endDate, search } = req.query;
        let sql = `
            SELECT e.id, e.title, e.category, e.amount, e.currency, e.expense_date,
                   e.payment_method, e.reference_no, e.recipient_name, e.teacher_id,
                   e.status, e.notes, e.receipt_url, e.recorded_by, e.created_at, e.updated_at,
                   t.name AS teacher_name, t.email AS teacher_email, t.subject AS teacher_subject
            FROM expenses e
            LEFT JOIN users t ON t.id = e.teacher_id
            WHERE e.deleted_at IS NULL
        `;
        const params = [];
        let idx = 1;

        if (category && category !== 'all') {
            sql += ` AND LOWER(e.category) = LOWER($${idx++})`;
            params.push(category.trim());
        }

        if (status && status !== 'all') {
            sql += ` AND LOWER(e.status) = LOWER($${idx++})`;
            params.push(status.trim());
        }

        if (teacherId && !isNaN(parseInt(teacherId))) {
            sql += ` AND e.teacher_id = $${idx++}`;
            params.push(parseInt(teacherId));
        }

        if (startDate) {
            sql += ` AND e.expense_date >= $${idx++}`;
            params.push(startDate);
        }

        if (endDate) {
            sql += ` AND e.expense_date <= $${idx++}`;
            params.push(endDate);
        }

        if (search && search.trim()) {
            sql += ` AND (
                LOWER(e.title) LIKE $${idx} OR 
                LOWER(COALESCE(e.recipient_name, '')) LIKE $${idx} OR 
                LOWER(COALESCE(e.reference_no, '')) LIKE $${idx} OR 
                LOWER(COALESCE(e.notes, '')) LIKE $${idx} OR
                LOWER(COALESCE(t.name, '')) LIKE $${idx}
            )`;
            params.push(`%${search.trim().toLowerCase()}%`);
            idx++;
        }

        sql += ` ORDER BY e.expense_date DESC, e.id DESC`;
        const { rows } = await query(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/expenses/stats - Financial summaries
router.get('/stats', async (req, res) => {
    try {
        const { rows: allRows } = await query(`
            SELECT id, category, amount, status, expense_date
            FROM expenses 
            WHERE deleted_at IS NULL
        `);

        const now = new Date();
        const curYear = now.getFullYear();
        const curMonth = now.getMonth(); // 0-indexed

        let totalExpenses = 0;
        let thisMonthExpenses = 0;
        let totalTeacherFees = 0;
        let totalRent = 0;
        let totalElectricity = 0;
        let totalWater = 0;
        let totalPending = 0;

        const categoryMap = {};
        Object.keys(EXPENSE_CATEGORIES).forEach(k => {
            categoryMap[k] = { category: k, label: EXPENSE_CATEGORIES[k], count: 0, amount: 0 };
        });

        allRows.forEach(r => {
            const amt = parseFloat(r.amount) || 0;
            const cat = (r.category || 'other').toLowerCase();
            const st = (r.status || 'paid').toLowerCase();

            if (st === 'pending') {
                totalPending += amt;
            }

            // Consider paid/approved for expense totals
            if (st !== 'cancelled') {
                totalExpenses += amt;

                const d = new Date(r.expense_date);
                if (!isNaN(d.getTime()) && d.getFullYear() === curYear && d.getMonth() === curMonth) {
                    thisMonthExpenses += amt;
                }

                if (cat === 'teacher_fee') totalTeacherFees += amt;
                else if (cat === 'rent') totalRent += amt;
                else if (cat === 'electricity') totalElectricity += amt;
                else if (cat === 'water') totalWater += amt;

                if (!categoryMap[cat]) {
                    categoryMap[cat] = { category: cat, label: cat, count: 0, amount: 0 };
                }
                categoryMap[cat].count++;
                categoryMap[cat].amount += amt;
            }
        });

        res.json({
            totalExpenses,
            thisMonthExpenses,
            totalTeacherFees,
            totalRent,
            totalElectricity,
            totalWater,
            totalUtilities: totalElectricity + totalWater + (categoryMap['internet'] ? categoryMap['internet'].amount : 0),
            totalPending,
            byCategory: Object.values(categoryMap)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/expenses/teacher/:teacherId - View disbursements for a specific teacher
router.get('/teacher/:teacherId', async (req, res) => {
    try {
        let teacherId = parseInt(req.params.teacherId);
        if (isNaN(teacherId) || teacherId <= 0) {
            const emailParam = req.query.email || req.params.teacherId;
            if (emailParam && typeof emailParam === 'string' && emailParam.includes('@')) {
                const { rows: uRows } = await query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND role = 'Teacher'`, [emailParam.trim()]);
                if (uRows[0]) teacherId = uRows[0].id;
            }
        }
        if (isNaN(teacherId) || teacherId <= 0) return res.status(400).json({ error: 'Valid teacherId or teacher email required.' });

        const { rows } = await query(`
            SELECT e.id, e.title, e.category, e.amount, e.currency, e.expense_date,
                   e.payment_method, e.reference_no, e.recipient_name, e.teacher_id,
                   e.status, e.notes, e.receipt_url, e.created_at
            FROM expenses e
            WHERE e.deleted_at IS NULL 
              AND e.teacher_id = $1
            ORDER BY e.expense_date DESC, e.id DESC
        `, [teacherId]);

        let totalPaid = 0;
        let totalPending = 0;
        let lastPayment = null;

        rows.forEach(r => {
            const amt = parseFloat(r.amount) || 0;
            if (r.status === 'paid') {
                totalPaid += amt;
                if (!lastPayment) lastPayment = r;
            } else if (r.status === 'pending') {
                totalPending += amt;
            }
        });

        res.json({
            teacherId,
            totalPaid,
            totalPending,
            lastPayment,
            payments: rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/expenses/:id - Single expense record
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { rows } = await query(`
            SELECT e.*, t.name AS teacher_name, t.email AS teacher_email, t.subject AS teacher_subject
            FROM expenses e
            LEFT JOIN users t ON t.id = e.teacher_id
            WHERE e.id = $1 AND e.deleted_at IS NULL
        `, [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Expense not found.' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/expenses - Record new expense manually
router.post('/', async (req, res) => {
    try {
        const {
            title, category, amount, currency, expenseDate,
            paymentMethod, referenceNo, recipientName, teacherId,
            status, notes, receiptUrl, recordedBy
        } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Expense title is required.' });
        }
        if (!category || !category.trim()) {
            return res.status(400).json({ error: 'Expense category is required.' });
        }
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount < 0) {
            return res.status(400).json({ error: 'Valid amount is required.' });
        }

        let resolvedTeacherId = teacherId ? parseInt(teacherId) : null;
        let finalRecipient = (recipientName || '').trim();

        // If category is teacher_fee and teacherId provided, lookup teacher name if recipientName empty
        if (category === 'teacher_fee' && resolvedTeacherId) {
            const { rows: tRows } = await query(`SELECT name FROM users WHERE id = $1 AND role = 'Teacher'`, [resolvedTeacherId]);
            if (tRows[0] && !finalRecipient) {
                finalRecipient = tRows[0].name;
            }
        }

        const dateVal = expenseDate || new Date().toISOString().split('T')[0];
        const statusVal = status || 'paid';
        const methodVal = paymentMethod || 'Cash';
        const curVal = currency || 'USD';

        const { rows } = await query(`
            INSERT INTO expenses (
                title, category, amount, currency, expense_date,
                payment_method, reference_no, recipient_name, teacher_id,
                status, notes, receipt_url, recorded_by, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9,
                $10, $11, $12, $13, NOW(), NOW()
            ) RETURNING *
        `, [
            title.trim(), category.trim(), parsedAmount, curVal, dateVal,
            methodVal, referenceNo || null, finalRecipient || null, resolvedTeacherId,
            statusVal, notes || null, receiptUrl || null, recordedBy || 'Admin'
        ]);

        res.status(201).json({
            message: 'Expense recorded successfully.',
            expense: rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/expenses/:id - Update existing expense
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const {
            title, category, amount, currency, expenseDate,
            paymentMethod, referenceNo, recipientName, teacherId,
            status, notes, receiptUrl
        } = req.body;

        const { rows: existing } = await query(`SELECT id FROM expenses WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (existing.length === 0) return res.status(404).json({ error: 'Expense record not found.' });

        let resolvedTeacherId = teacherId !== undefined ? (teacherId ? parseInt(teacherId) : null) : undefined;
        let finalRecipient = recipientName !== undefined ? (recipientName ? recipientName.trim() : null) : undefined;

        if (category === 'teacher_fee' && resolvedTeacherId && !finalRecipient) {
            const { rows: tRows } = await query(`SELECT name FROM users WHERE id = $1 AND role = 'Teacher'`, [resolvedTeacherId]);
            if (tRows[0]) finalRecipient = tRows[0].name;
        }

        const { rows } = await query(`
            UPDATE expenses SET
                title = COALESCE($1, title),
                category = COALESCE($2, category),
                amount = COALESCE($3, amount),
                currency = COALESCE($4, currency),
                expense_date = COALESCE($5, expense_date),
                payment_method = COALESCE($6, payment_method),
                reference_no = COALESCE($7, reference_no),
                recipient_name = COALESCE($8, recipient_name),
                teacher_id = $9,
                status = COALESCE($10, status),
                notes = COALESCE($11, notes),
                receipt_url = COALESCE($12, receipt_url),
                updated_at = NOW()
            WHERE id = $13 AND deleted_at IS NULL
            RETURNING *
        `, [
            title ? title.trim() : null,
            category ? category.trim() : null,
            amount !== undefined ? parseFloat(amount) : null,
            currency || null,
            expenseDate || null,
            paymentMethod || null,
            referenceNo !== undefined ? referenceNo : null,
            finalRecipient !== undefined ? finalRecipient : null,
            resolvedTeacherId !== undefined ? resolvedTeacherId : null,
            status || null,
            notes !== undefined ? notes : null,
            receiptUrl !== undefined ? receiptUrl : null,
            id
        ]);

        res.json({ message: 'Expense updated successfully.', expense: rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/expenses/:id - Soft-delete expense
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { rows } = await query(`
            UPDATE expenses SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, title
        `, [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Expense record not found.' });
        res.json({ message: `Expense "${rows[0].title}" moved to trash.`, id: rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
