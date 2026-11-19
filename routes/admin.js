const express = require('express');
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

const r = express.Router();

r.use(requireAdmin);

r.get('/dashboard', async (req, res, next) => {
    try {
        const [[employees]] = await db.query('SELECT COUNT(*) AS total FROM employees');
        const [[departments]] = await db.query('SELECT COUNT(*) AS total FROM departments');
        const [[designations]] = await db.query('SELECT COUNT(*) AS total FROM designations');
        const [[active]] = await db.query("SELECT COUNT(*) AS total FROM employees WHERE status = 'Active'");
        const [[pending]] = await db.query("SELECT COUNT(*) AS total FROM leave_requests WHERE status = 'Pending'");
        res.render('admin/dashboard', {
            title: 'Admin Dashboard',
            employees: employees.total,
            departments: departments.total,
            designations: designations.total,
            active: active.total,
            pending: pending.total
        });
    } catch (error) {
        next(error);
    }
});

r.get('/employees/new', async (req, res, next) => {
    try {
        const [departments] = await db.query('SELECT * FROM departments ORDER BY name');
        const [designations] = await db.query('SELECT * FROM designations ORDER BY name');
        res.render('admin/add', {
            title: 'Add Employee',
            departments,
            designations
        });
    } catch (error) {
        next(error);
    }
});

r.post('/employees', async (req, res, next) => {
    try {
        const {
            employeeId, fullName, email, phone, departmentId,
            designationId, salary, dateOfBirth, address
        } = req.body;

        if (!employeeId || !fullName || !email || !phone || !departmentId ||
            !designationId || !salary || !dateOfBirth || !address) {
            req.flash('error', 'Please complete all employee fields.');
            return res.redirect('/admin/employees/new');
        }

        await db.execute(
            `INSERT INTO employees
            (employee_id, full_name, email, phone, department_id, designation_id,
            salary, date_of_birth, address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [employeeId, fullName, email, phone, departmentId, designationId,
                salary, dateOfBirth, address]
        );

        req.flash('success', 'Employee added successfully.');
        res.redirect('/admin/employees');
    } catch (error) {
        next(error);
    }
});

r.get('/employees', async (req, res, next) => {
    try {
        const mode = ['update', 'remove'].includes(req.query.mode)
            ? req.query.mode
            : 'view';
        const search = (req.query.q || '').trim();

        const [employees] = await db.execute(
            `SELECT e.*, d.name AS department, g.name AS designation
            FROM employees e
            JOIN departments d ON d.id = e.department_id
            JOIN designations g ON g.id = e.designation_id
            WHERE e.employee_id LIKE ? OR e.full_name LIKE ?
            OR e.email LIKE ? OR e.phone LIKE ? OR d.name LIKE ?
            ORDER BY e.created_at DESC`,
            Array(5).fill('%' + search + '%')
        );

        res.render('admin/list', {
            title: 'Employees',
            employees,
            search,
            mode
        });
    } catch (error) {
        next(error);
    }
});

r.get('/employees/:id/edit', async (req, res, next) => {
    try {
        const [rows] = await db.execute(
            `SELECT e.*, d.name AS department, g.name AS designation
            FROM employees e
            JOIN departments d ON d.id = e.department_id
            JOIN designations g ON g.id = e.designation_id
            WHERE e.employee_id = ?`,
            [req.params.id]
        );

        if (!rows.length) {
            req.flash('error', 'Employee not found.');
            return res.redirect('/admin/employees');
        }

        const [departments] = await db.query('SELECT * FROM departments ORDER BY name');
        const [designations] = await db.query('SELECT * FROM designations ORDER BY name');

        res.render('admin/edit', {
            title: 'Update Employee',
            employee: rows[0],
            departments,
            designations
        });
    } catch (error) {
        next(error);
    }
});

r.post('/employees/:id/update', async (req, res, next) => {
    try {
        const { departmentId, designationId, salary } = req.body;

        await db.execute(
            `UPDATE employees
            SET department_id = ?, designation_id = ?, salary = ?
            WHERE employee_id = ?`,
            [departmentId, designationId, salary, req.params.id]
        );

        req.flash('success', 'Employee updated successfully.');
        res.redirect('/admin/employees?mode=update');
    } catch (error) {
        next(error);
    }
});

r.post('/employees/:id/delete', async (req, res, next) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await connection.execute(
            'DELETE FROM leave_requests WHERE employee_id = ?',
            [req.params.id]
        );

        await connection.execute(
            'DELETE FROM attendance WHERE employee_id = ?',
            [req.params.id]
        );

        await connection.execute(
            'DELETE FROM users WHERE employee_id = ?',
            [req.params.id]
        );

        await connection.execute(
            'DELETE FROM employees WHERE employee_id = ?',
            [req.params.id]
        );

        await connection.commit();
        req.flash('success', 'Employee removed successfully.');
        res.redirect('/admin/employees?mode=remove');
    } catch (error) {
        await connection.rollback();
        next(error);
    } finally {
        connection.release();
    }
});

r.get('/leaves', async (req, res, next) => {
    try {
        const [leaves] = await db.query(
            `SELECT l.*, e.full_name
            FROM leave_requests l
            JOIN employees e ON e.employee_id = l.employee_id
            ORDER BY FIELD(l.status, 'Pending', 'Approved', 'Declined', 'Cancelled'),
            l.created_at DESC`
        );

        res.render('admin/leaves', {
            title: 'Leave Requests',
            leaves
        });
    } catch (error) {
        next(error);
    }
});

r.post('/leaves/:id/:action', async (req, res, next) => {
    try {
        const action = req.params.action;
        if (!['approve', 'decline'].includes(action)) {
            return res.redirect('/admin/leaves');
        }

        const status = action === 'approve' ? 'Approved' : 'Declined';

        const [result] = await db.execute(
            `UPDATE leave_requests
            SET status = ?, reviewed_by = ?
            WHERE id = ? AND status = 'Pending'`,
            [status, req.session.user.id, req.params.id]
        );

        req.flash(
            result.affectedRows ? 'success' : 'error',
            result.affectedRows
                ? 'Leave request ' + status.toLowerCase() + '.'
                : 'This leave request is no longer pending.'
        );

        res.redirect('/admin/leaves');
    } catch (error) {
        next(error);
    }
});

r.get('/attendance', async (req, res, next) => {
    try {
        const search = (req.query.q || '').trim();
        const date = (req.query.date || '').trim();
        const month = (req.query.month || '').trim();

        let sql = `
            SELECT a.*, e.full_name
            FROM attendance a
            JOIN employees e ON e.employee_id = a.employee_id
            WHERE (a.employee_id LIKE ? OR e.full_name LIKE ?)
        `;
        const params = ['%' + search + '%', '%' + search + '%'];

        if (date) {
            sql += ' AND a.attendance_date = ?';
            params.push(date);
        } else if (/^\d{4}-\d{2}$/.test(month)) {
            sql += ' AND DATE_FORMAT(a.attendance_date, "%Y-%m") = ?';
            params.push(month);
        }

        sql += ' ORDER BY a.attendance_date DESC, e.full_name';

        const [records] = await db.execute(sql, params);

        let summarySql = `
            SELECT COUNT(*) AS total_days,
            SUM(status = 'Present') AS present_days,
            SUM(status = 'Incomplete') AS incomplete_days
            FROM attendance
            WHERE 1 = 1
        `;
        const summaryParams = [];

        if (month && !date && /^\d{4}-\d{2}$/.test(month)) {
            summarySql += ' AND DATE_FORMAT(attendance_date, "%Y-%m") = ?';
            summaryParams.push(month);
        }

        const [[summary]] = await db.execute(summarySql, summaryParams);

        res.render('admin/attendance', {
            title: 'Attendance Management',
            records,
            search,
            date,
            month,
            summary
        });
    } catch (error) {
        next(error);
    }
});

module.exports = r;
