// Backend/routes/auth.js

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../database.js');
const emailService = require('../services/emailService.js');
const router = express.Router();

// --- Registration Route ---
router.post('/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await query(
            `INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)`,
            [name, email, hashedPassword, role]
        );
        
        // Send verification email for all roles
        emailService.sendWelcomeEmail(email, name).catch(err => {
            console.error('Failed to send verification email:', err);
        });
        
        return res.status(201).json({ message: 'User registered successfully!' });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'This email is already registered.' });
        }
        return res.status(500).json({ error: 'An error occurred during registration.' });
    }
});

// --- Login Route ---
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const { rows } = await query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role IS NOT NULL AND role != ''`, [email]);
        const user = rows[0];
        if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

        // Check if email is verified
        if (user.isactive === false) {
            return res.status(403).json({ message: 'Please verify your email before logging in.', emailNotVerified: true });
        }

        const match = await bcrypt.compare(password, user.password);
        if (match) return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, subject: user.subject } });
        if (password === user.password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await query(`UPDATE users SET password = $1 WHERE id = $2`, [hashedPassword, user.id]);
            return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, subject: user.subject } });
        }
        return res.status(401).json({ message: 'Invalid credentials.' });
    } catch (err) {
        return res.status(500).json({ message: 'Database error.' });
    }
});

// --- Resend Verification Route ---
router.post('/resend-verification', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    try {
        const { rows } = await query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role IS NOT NULL AND role != ''`, [email]);
        const user = rows[0];
        if (!user) return res.status(200).json({ message: 'If an account with that email exists, a verification link will be sent.' });
        if (user.isactive !== false) {
            return res.status(200).json({ message: 'This email is already verified.' });
        }
        emailService.sendWelcomeEmail(email, user.name).catch(err => {
            console.error('Failed to resend verification email:', err);
        });
        return res.json({ message: 'Verification email sent. Please check your inbox.' });
    } catch (err) {
        return res.status(500).json({ error: 'Error sending verification email.' });
    }
});

// --- Forgot Password Route ---
router.post('/forgot', async (req, res) => {
    const { email } = req.body;
    try {
        const { rows } = await query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role IS NOT NULL AND role != ''`, [email]);
        const user = rows[0];
        if (!user) return res.status(200).json({ message: 'If an account with that email exists, a link will be sent.' });
        const token = crypto.randomBytes(20).toString('hex');
        const expires = Date.now() + 3600000;
        await query(`UPDATE users SET resetpasswordtoken = $1, resetpasswordexpires = $2 WHERE LOWER(email) = LOWER($3)`, [token, expires, email]);
        const resetLink = `http://localhost:3000/HTML/reset-password.html?token=${token}`;
        return res.json({ message: 'Reset link generated.', resetLink });
    } catch (err) {
        return res.status(500).json({ error: 'Error setting token.' });
    }
});

// --- Reset Password Validation Route ---
router.get('/reset/:token', async (req, res) => {
    try {
        const { rows } = await query(`SELECT * FROM users WHERE resetpasswordtoken = $1`, [req.params.token]);
        if (!rows[0]) return res.status(400).json({ error: 'Password reset token is invalid.' });
        return res.status(200).json({ message: 'Token is valid.' });
    } catch (err) {
        return res.status(500).json({ error: 'Server error.' });
    }
});

// --- Update Password Route ---
router.post('/update-password', async (req, res) => {
    const { token, password } = req.body;
    try {
        const { rows } = await query(`SELECT * FROM users WHERE resetpasswordtoken = $1`, [token]);
        const user = rows[0];
        if (!user) return res.status(400).json({ error: 'Token is invalid.' });
        const hashedPassword = await bcrypt.hash(password, 10);
        await query(
            `UPDATE users SET password = $1, resetpasswordtoken = NULL, resetpasswordexpires = NULL WHERE id = $2`,
            [hashedPassword, user.id]
        );
        return res.status(200).json({ message: 'Password has been updated successfully!' });
    } catch (err) {
        return res.status(500).json({ error: 'An error occurred while updating the password.' });
    }
});

module.exports = router;