const app = require('../Backend/server');

module.exports = (req, res) => {
    // If Vercel rewrites or strips the /api prefix, restore it so Express router matches
    if (req.url && !req.url.startsWith('/api')) {
        req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
    return app(req, res);
};
