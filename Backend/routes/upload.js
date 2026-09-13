const express = require('express');
const multer = require('multer');
const path = require('path');
const { uploadBuffer } = require('../services/storage');
const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const imageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        const docTypes = ['.pdf', '.doc', '.docx', '.epub'];
        if (file.fieldname === 'image' && imageTypes.includes(ext)) return cb(null, true);
        if (file.fieldname === 'file' && docTypes.includes(ext)) return cb(null, true);
        cb(new Error('Invalid file type. Images: jpg, jpeg, png, gif, webp, svg. Files: pdf, doc, docx, epub.'));
    }
});

router.post('/', (req, res) => {
    upload.fields([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }])(req, res, async (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large. Max 10MB.' });
                return res.status(400).json({ error: err.message });
            }
            return res.status(400).json({ error: err.message });
        }
        const image = req.files && req.files.image && req.files.image[0];
        const file = req.files && req.files.file && req.files.file[0];
        const uploaded = image || file;
        if (!uploaded) return res.status(400).json({ error: 'No file uploaded.' });
        const folder = (req.body && req.body.folder) || 'images';
        try {
            const url = await uploadBuffer(uploaded.buffer, folder, uploaded.originalname, uploaded.mimetype);
            res.json({ url, filename: path.basename(url) });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
});

module.exports = router;
