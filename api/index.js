const app = require('../Backend/server');

module.exports = (req, res) => {
    try {
        // Normalize URL if Vercel appended /api/index.js
        if (req.url && req.url.startsWith('/api/index.js')) {
            req.url = req.url.replace('/api/index.js', '/api');
        }
        return app(req, res);
    } catch (err) {
        console.error('[Vercel Invocation Crash]', err);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Serverless Invocation Error',
                message: err.message || String(err)
            });
        }
    }
};
