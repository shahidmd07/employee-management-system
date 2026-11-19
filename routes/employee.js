const express = require('express');
const db = require('../config/db');
const { requireEmployee } = require('../middleware/auth');

const r = express.Router();

r.use(requireEmployee);

r.use(async (req, res, next) => {
    try {
        const employeeId = req.session.user.employee_id;
        const [currentLeaves] = await db.execute(
            `SELECT id, status FROM leave_requests
            WHERE employee_id = ?`,
            [employeeId]
        );

        const snapshotKey = 'leaveStatusSnapshot_' + employeeId;
        const previous = req.session[snapshotKey];

        if (previous) {
            currentLeaves.forEach(leave => {
                const oldStatus = previous[leave.id];

                if (oldStatus === 'Pending' &&
                    ['Approved', 'Declined'].includes(leave.status)) {
                    req.flash(
                        'success',
                        'Your leave request #' + leave.id + ' has been ' +
                        leave.status.toLowerCase() + '.'
                    );
                }
            });
        }

        req.session[snapshotKey] = Object.fromEntries(
            currentLeaves.map(leave => [leave.id, leave.status])
        );

        next();
    } catch (error) {
        next(error);
    }
});

r.get('/dashboard', async (req, res, next) => {
    try {
        const employeeId = req.session.user.employee_id;

        const [[employee]] = await db.execute(
            `SELECT e.*, d.name AS department, g.name AS designation
            FROM employees e
            JOIN departments d ON d.id = e.department_id
            JOIN designations g ON g.id = e.designation_id
            WHERE e.employee_id = ?`,
            [employeeId]
        );

        const [[counts]] = await db.execute(
            `SELECT
            SUM(status = 'Pending') AS pending,
            SUM(status = 'Approved') AS approved,
            SUM(status = 'Declined') AS declined
            FROM leave_requests WHERE employee_id = ?`,
            [employeeId]
        );

        res.render('employee/dashboard', {
            title: 'Employee Dashboard',
            employee,
            counts
        });
    } catch (error) {
        next(error);
    }
});

r.get('/details', async (req, res, next) => {
    try {
        const [rows] = await db.execute(
            `SELECT e.*, d.name AS department, g.name AS designation
            FROM employees e
            JOIN departments d ON d.id = e.department_id
            JOIN designations g ON g.id = e.designation_id
            WHERE e.employee_id = ?`,
            [req.session.user.employee_id]
        );

        res.render('employee/details', {
            title: 'My Details',
            employee: rows[0]
        });
    } catch (error) {
        next(error);
    }
});

r.get('/leave/apply', (req, res) => {
    res.render('employee/apply', { title: 'Apply Leave' });
});

r.post('/leave/apply', async (req, res, next) => {
    try {
        const { leaveType, fromDate, toDate, reason } = req.body;

        if (!leaveType || !fromDate || !toDate || !reason || toDate < fromDate) {
            req.flash('error', 'Please enter valid leave details.');
            return res.redirect('/employee/leave/apply');
        }

        await db.execute(
            `INSERT INTO leave_requests
            (employee_id, leave_type, from_date, to_date, reason)
            VALUES (?, ?, ?, ?, ?)`,
            [req.session.user.employee_id, leaveType, fromDate, toDate, reason]
        );

        req.flash('success', 'Leave request submitted successfully.');
        res.redirect('/employee/leaves');
    } catch (error) {
        next(error);
    }
});

r.get('/leaves', async (req, res, next) => {
    try {
        const [leaves] = await db.execute(
            `SELECT * FROM leave_requests
            WHERE employee_id = ?
            ORDER BY created_at DESC`,
            [req.session.user.employee_id]
        );

        res.render('employee/leaves', {
            title: 'Leave Request Tracking',
            leaves
        });
    } catch (error) {
        next(error);
    }
});

r.post('/leaves/:id/cancel', async (req, res, next) => {
    try {
        const [result] = await db.execute(
            `UPDATE leave_requests
            SET status = 'Cancelled'
            WHERE id = ? AND employee_id = ? AND status = 'Pending'`,
            [req.params.id, req.session.user.employee_id]
        );

        req.flash(
            result.affectedRows ? 'success' : 'error',
            result.affectedRows
                ? 'Leave request cancelled successfully.'
                : 'Only pending leave requests can be cancelled.'
        );

        res.redirect('/employee/leaves');
    } catch (error) {
        next(error);
    }
});

r.get('/attendance', async (req, res, next) => {
    try {
        const employeeId = req.session.user.employee_id;
        const month = /^\d{4}-\d{2}$/.test(req.query.month || '')
            ? req.query.month
            : new Date().toISOString().slice(0, 7);

        const [[today]] = await db.execute(
            `SELECT * FROM attendance
            WHERE employee_id = ? AND attendance_date = CURDATE()`,
            [employeeId]
        );

        const [records] = await db.execute(
            `SELECT * FROM attendance
            WHERE employee_id = ?
            AND DATE_FORMAT(attendance_date, '%Y-%m') = ?
            ORDER BY attendance_date DESC`,
            [employeeId, month]
        );

        const [[summary]] = await db.execute(
            `SELECT COUNT(*) AS total_days,
            SUM(status = 'Present') AS present_days,
            SUM(status = 'Incomplete') AS incomplete_days
            FROM attendance
            WHERE employee_id = ?
            AND DATE_FORMAT(attendance_date, '%Y-%m') = ?`,
            [employeeId, month]
        );

        res.render('employee/attendance', {
            title: 'My Attendance',
            today,
            records,
            summary,
            month
        });
    } catch (error) {
        next(error);
    }
});

r.post('/attendance/check-in', async (req, res, next) => {
    try {
        const employeeId = req.session.user.employee_id;

        const [existing] = await db.execute(
            `SELECT id, check_in
            FROM attendance
            WHERE employee_id = ? AND attendance_date = CURDATE()`,
            [employeeId]
        );

        if (existing.length && existing[0].check_in) {
            req.flash('error', 'You have already checked in today.');
            return res.redirect('/employee/attendance');
        }

        if (existing.length) {
            await db.execute(
                `UPDATE attendance
                SET check_in = NOW(), status = 'Incomplete'
                WHERE id = ? AND check_in IS NULL`,
                [existing[0].id]
            );
        } else {
            await db.execute(
                `INSERT INTO attendance
                (employee_id, attendance_date, check_in, status)
                VALUES (?, CURDATE(), NOW(), 'Incomplete')`,
                [employeeId]
            );
        }

        req.flash('success', 'Check In recorded successfully.');
        res.redirect('/employee/attendance');
    } catch (error) {
        next(error);
    }
});

r.post('/attendance/check-out', async (req, res, next) => {
    try {
        const [result] = await db.execute(
            `UPDATE attendance
            SET check_out = NOW(), status = 'Present'
            WHERE employee_id = ?
            AND attendance_date = CURDATE()
            AND check_in IS NOT NULL
            AND check_out IS NULL`,
            [req.session.user.employee_id]
        );

        req.flash(
            result.affectedRows ? 'success' : 'error',
            result.affectedRows
                ? 'Check Out recorded successfully.'
                : 'Check In is required before Check Out.'
        );

        res.redirect('/employee/attendance');
    } catch (error) {
        next(error);
    }
});

module.exports = r;
