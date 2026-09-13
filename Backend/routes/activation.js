// Backend/routes/activation.js

const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');

// Verify activation token
router.get('/verify/:token', async (req, res) => {
    try {
        const user = await emailService.verifyActivation(req.params.token);
        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired activation link.' });
        }
        res.json({ valid: true, user: { name: user.name, email: user.email } });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// Activate account
router.post('/activate', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Activation token is required.' });
    }
    
    try {
        const result = await emailService.activateAccount(token);
        if (result.success) {
            res.json({ message: 'Account activated successfully!', user: result.user });
        } else {
            res.status(400).json({ error: result.error });
        }
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
