const check = role => (req, res, next) => {
    if (!req.session.user) {
        req.flash('error', 'Please log in.');
        return res.redirect('/login');
    }

    if (role && req.session.user.role !== role) {
        req.flash('error', 'You are not authorized.');
        return res.redirect('/dashboard');
    }

    next();
};

module.exports = {
    requireAuth: check(),
    requireAdmin: check('admin'),
    requireEmployee: check('employee')
};
