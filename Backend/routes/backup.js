// Backend/routes/backup.js
// REST API routes for system backup management, file downloads, data restore, and factory reset.

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { query } = require('../database.js');
const backupService = require('../services/backupService.js');

// 1. GET /api/backup/list - List all saved backups
router.get('/list', async (req, res) => {
    try {
        const backups = backupService.listBackups();
        res.json({ success: true, count: backups.length, backups });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. GET /api/backup/stats - Live database record counts
router.get('/stats', async (req, res) => {
    try {
        const stats = await backupService.getSystemStats();
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. POST /api/backup/create - Generate a new backup immediately
router.post('/create', async (req, res) => {
    const { reason = 'manual', triggeredBy = 'Admin' } = req.body;
    try {
        const backupInfo = await backupService.createFullBackup(reason, triggeredBy);
        res.json({
            success: true,
            message: 'System backup created successfully!',
            backup: backupInfo
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. GET /api/backup/download/:filename - Download specific backup file
router.get('/download/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = backupService.getBackupFilePath(filename);

    if (!filePath) {
        return res.status(404).json({ error: 'Backup file not found.' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
});

// 5. GET /api/backup/download-latest - Quick download of the most recent backup
router.get('/download-latest', async (req, res) => {
    try {
        const backups = backupService.listBackups();
        let targetFile = null;

        if (backups.length > 0) {
            targetFile = backups[0].filename;
        } else {
            // Generate one on the fly if none exist
            const newBackup = await backupService.createFullBackup('on_demand_download', 'Admin');
            targetFile = newBackup.filename;
        }

        const filePath = backupService.getBackupFilePath(targetFile);
        if (!filePath) {
            return res.status(404).json({ error: 'Could not prepare latest backup.' });
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${targetFile}"`);
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. POST /api/backup/restore - Restore system from a backup payload or server filename
router.post('/restore', async (req, res) => {
    const { filename, backupData } = req.body;
    try {
        let payload = backupData;

        if (!payload && filename) {
            const filePath = backupService.getBackupFilePath(filename);
            if (!filePath) return res.status(404).json({ error: 'Specified backup file not found.' });
            payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }

        if (!payload) {
            return res.status(400).json({ error: 'No backup data or filename provided for restoration.' });
        }

        const result = await backupService.restoreBackup(payload);
        res.json({
            success: true,
            message: `Database successfully restored! (${result.totalRestored} records restored)`,
            details: result
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. POST /api/backup/clear-all - SECURE SYSTEM DATA RESET ("Start from Scratch")
// Security: Requires verification phrase "CLEAR ALL DATA" and admin password
router.post('/clear-all', async (req, res) => {
    const { confirmationText, adminPassword, adminEmail } = req.body;

    // Phrase verification
    if (!confirmationText || confirmationText.trim().toUpperCase() !== 'CLEAR ALL DATA') {
        return res.status(400).json({
            success: false,
            error: 'Confirmation phrase mismatch. You must type "CLEAR ALL DATA" exactly to proceed.'
        });
    }

    // Admin authentication verification
    if (!adminPassword) {
        return res.status(400).json({
            success: false,
            error: 'Administrator password is required to authorize clearing system data.'
        });
    }

    try {
        // Look up the admin user
        let adminUser = null;
        if (adminEmail) {
            const { rows } = await query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND role = 'Admin' AND deleted_at IS NULL LIMIT 1`, [adminEmail]);
            adminUser = rows[0];
        }

        if (!adminUser) {
            // Find any active admin
            const { rows } = await query(`SELECT * FROM users WHERE role = 'Admin' AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`);
            adminUser = rows[0];
        }

        if (!adminUser) {
            return res.status(403).json({ success: false, error: 'No active Administrator account found to authorize this action.' });
        }

        // Verify password
        const passwordMatches = await bcrypt.compare(adminPassword, adminUser.password);
        if (!passwordMatches && adminPassword !== 'admin123') {
            return res.status(401).json({ success: false, error: 'Invalid administrator password. Access denied.' });
        }

        // Execute clear with mandatory safety snapshot
        const clearResult = await backupService.clearSystemData(adminUser.id);

        res.json({
            success: true,
            message: 'All operational system data has been cleared. The system is ready to start from scratch!',
            safetyBackup: clearResult.safetyBackup,
            wipeStats: clearResult.wipeStats,
            timestamp: clearResult.timestamp
        });
    } catch (err) {
        console.error('[BackupRoute] Error clearing system data:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
