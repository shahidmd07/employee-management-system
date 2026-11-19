const express = require('express');
const { requireAuth } = require('../middleware/auth');

const r = express.Router();

r.get('/', (req, res) => {
    res.redirect('/login');
});

r.get('/dashboard', requireAuth, (req, res) => {
    if (req.session.user.role === 'admin') {
        return res.redirect('/admin/dashboard');
    }

    res.redirect('/employee/dashboard');
});

module.exports = r;
