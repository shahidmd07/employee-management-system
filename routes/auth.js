const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const r = express.Router();

r.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('auth/login', { title: 'Login' });
});

r.post('/login', async (req, res, next) => {
    try {
        const { username, password } = req.body;
        const [rows] = await db.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
            req.flash('error', 'Invalid username or password.');
            return res.redirect('/login');
        }

        req.session.regenerate(error => {
            if (error) return next(error);
            req.session.user = {
                id: rows[0].id,
                username: rows[0].username,
                role: rows[0].role,
                employee_id: rows[0].employee_id
            };
            res.redirect('/dashboard');
        });
    } catch (error) {
        next(error);
    }
});

r.get('/admin/register', async (req, res, next) => {
    try {
        const [rows] = await db.execute(
            "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'"
        );
        if (rows[0].total > 0) {
            req.flash('error', 'Admin account has already been created.');
            return res.redirect('/login');
        }
        res.render('auth/admin-register', { title: 'Admin Setup' });
    } catch (error) {
        next(error);
    }
});

r.post('/admin/register', async (req, res, next) => {
    try {
        const { username, password, confirmPassword } = req.body;

        if (!username || !password || password !== confirmPassword) {
            req.flash('error', 'Enter valid details and matching passwords.');
            return res.redirect('/admin/register');
        }

        const [admins] = await db.execute(
            "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'"
        );

        if (admins[0].total > 0) {
            req.flash('error', 'Admin account has already been created.');
            return res.redirect('/login');
        }

        const hash = await bcrypt.hash(password, 12);
        await db.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')",
            [username, hash]
        );

        req.flash('success', 'Admin account created. Please log in.');
        res.redirect('/login');
    } catch (error) {
        next(error);
    }
});

r.get('/employee/register', (req, res) => {
    res.render('auth/employee-register', { title: 'Employee Registration' });
});

r.post('/employee/register', async (req, res, next) => {
    try {
        const { employeeId, username, password, confirmPassword } = req.body;

        if (!employeeId || !username || !password || password !== confirmPassword) {
            req.flash('error', 'Enter valid details and matching passwords.');
            return res.redirect('/employee/register');
        }

        const [employees] = await db.execute(
            "SELECT employee_id FROM employees WHERE employee_id = ? AND status = 'Active'",
            [employeeId]
        );

        if (!employees.length) {
            req.flash('error', 'Employee ID not found or inactive.');
            return res.redirect('/employee/register');
        }

        const [existing] = await db.execute(
            'SELECT id FROM users WHERE username = ? OR employee_id = ?',
            [username, employeeId]
        );

        if (existing.length) {
            req.flash('error', 'Username or Employee ID is already registered.');
            return res.redirect('/employee/register');
        }

        const hash = await bcrypt.hash(password, 12);
        await db.execute(
            "INSERT INTO users (username, password_hash, role, employee_id) VALUES (?, ?, 'employee', ?)",
            [username, hash, employeeId]
        );

        req.flash('success', 'Employee account created. Please log in.');
        res.redirect('/login');
    } catch (error) {
        next(error);
    }
});

r.get('/change-password', requireAuth, (req, res) => {
    res.render('auth/password', { title: 'Change Password' });
});

r.post('/change-password', requireAuth, async (req, res, next) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const [rows] = await db.execute(
            'SELECT password_hash FROM users WHERE id = ?',
            [req.session.user.id]
        );

        if (!rows.length || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
            req.flash('error', 'Current password is incorrect.');
            return res.redirect('/change-password');
        }

        if (!newPassword || newPassword !== confirmPassword) {
            req.flash('error', 'New passwords do not match.');
            return res.redirect('/change-password');
        }

        const hash = await bcrypt.hash(newPassword, 12);
        await db.execute(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [hash, req.session.user.id]
        );

        req.flash('success', 'Password changed successfully.');
        res.redirect('/change-password');
    } catch (error) {
        next(error);
    }
});

r.post('/logout', requireAuth, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('ems.sid');
        res.redirect('/login');
    });
});

module.exports = r;
