// Backend/routes/messages.js

const express = require('express');
const { query } = require('../database.js');
const router = express.Router();

async function ensureTables() {
    await query(`
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            channelid TEXT NOT NULL,
            sender TEXT,
            recipient_type TEXT DEFAULT 'general',
            recipient_id TEXT,
            subject TEXT,
            body TEXT,
            category TEXT DEFAULT 'general',
            language TEXT DEFAULT 'en',
            time TEXT,
            isread BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW(),
            deleted_at TIMESTAMP
        )
    `);
    try {
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_type TEXT DEFAULT 'general'`);
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_id TEXT`);
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general'`);
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en'`);
        await query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
    } catch (e) {}
}

// GET all messages, grouped by channel
router.get('/', async (req, res) => {
    try {
        await ensureTables();
        const { rows } = await query(`SELECT * FROM messages WHERE deleted_at IS NULL ORDER BY id DESC`);
        const groupedMessages = rows.reduce((acc, msg) => {
            const channel = msg.channelid || 'general';
            if (!acc[channel]) acc[channel] = [];
            msg.unread = msg.isread === false;
            acc[channel].push(msg);
            return acc;
        }, {});
        res.json(groupedMessages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET messages for a specific channel or recipient (e.g., student-123 or parent-456)
router.get('/channel/:channelId', async (req, res) => {
    try {
        await ensureTables();
        const { rows } = await query(
            `SELECT * FROM messages WHERE channelid = $1 AND deleted_at IS NULL ORDER BY id DESC`,
            [req.params.channelId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST (send) a new message
router.post('/', async (req, res) => {
    const { channelId, subject, body, sender, category, recipientType, recipientId, language } = req.body;
    const messageSender = sender || 'Admin';
    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    try {
        await ensureTables();
        const { rows } = await query(
            `INSERT INTO messages (channelid, sender, subject, body, category, recipient_type, recipient_id, language, time) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [
                channelId || 'general',
                messageSender,
                subject || 'Notification',
                body || '',
                category || 'general',
                recipientType || 'general',
                recipientId || null,
                language || 'en',
                time
            ]
        );
        res.status(201).json({ message: 'Message sent successfully!', id: rows[0].id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST send direct alert message to parent (for Fee Payment or Low Attendance)
router.post('/send-parent-alert', async (req, res) => {
    const { studentId, studentName, parentId, alertType, customSubject, customMessage, language } = req.body;
    
    if (!studentId && !parentId) {
        return res.status(400).json({ error: 'Student ID or Parent ID is required.' });
    }

    try {
        await ensureTables();
        const lang = language || 'en';
        let subject = customSubject;
        let body = customMessage;

        // Auto-template presets based on alert type & selected language if custom subject/body not provided
        if (!subject || !body) {
            if (alertType === 'fee') {
                if (lang === 'so') {
                    subject = `Digniin Bixinta Lacagta: ${studentName || 'Ardayga'}`;
                    body = `Waalidka sharafta leh, kani waa reminder ku saabsan bixinta lacagta dugsiga ee bishan ee ardayga ${studentName || ''}. Fadlan bixi lacagta inta aysan dib u dhacin. Mahadsanid.`;
                } else if (lang === 'ar') {
                    subject = `تذكير بسداد الرسوم: ${studentName || 'الطالب'}`;
                    body = `عزيزي ولي الأمر، نود تذكيركم بضرورة سداد الرسوم الدراسية الشهرية الخاصة بالطالب ${studentName || ''}. يرجى السداد في أقرب وقت. شكراً لكم.`;
                } else {
                    subject = `Fee Payment Reminder: ${studentName || 'Student'}`;
                    body = `Dear Parent, this is a reminder regarding the monthly school fee payment for student ${studentName || ''}. Please complete payment promptly. Thank you.`;
                }
            } else if (alertType === 'attendance') {
                if (lang === 'so') {
                    subject = `Digniin Imaansha Hooseeya: ${studentName || 'Ardayga'}`;
                    body = `Waalidka sharafta leh, ilmahaaga ${studentName || ''} waxaa lagu arkay in imaanshihiisa skoolka uu hooseeyo bishan. Fadlan kala soo xiriir maamulka skoolka. Mahadsanid.`;
                } else if (lang === 'ar') {
                    subject = `تنبيه انخفاض الحضور: ${studentName || 'الطالب'}`;
                    body = `عزيزي ولي الأمر، يرجى العلم أن نسبة حضور الطالب ${studentName || ''} قد انخفضت هذا الشهر. يرجى التواصل مع إدارة الكلية. شكراً لكم.`;
                } else {
                    subject = `Low Attendance Alert: ${studentName || 'Student'}`;
                    body = `Dear Parent, your child ${studentName || ''} has recorded low attendance this month. Please contact the school administration. Thank you.`;
                }
            }
        }

        const channelId = parentId ? `parent-${parentId}` : `student-${studentId}`;
        const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        const { rows } = await query(
            `INSERT INTO messages (channelid, sender, subject, body, category, recipient_type, recipient_id, language, time)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [
                channelId,
                'School Administration',
                subject,
                body,
                alertType || 'alert',
                'parent',
                parentId || studentId,
                lang,
                time
            ]
        );

        res.status(201).json({ message: 'Parent notification sent successfully!', id: rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT (mark a message as read)
router.put('/read/:id', async (req, res) => {
    try {
        await ensureTables();
        await query(`UPDATE messages SET isread = true WHERE id = $1`, [req.params.id]);
        res.json({ message: 'success' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;