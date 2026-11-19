require('dotenv').config();

const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const layouts = require('express-ejs-layouts');
const helmet = require('helmet');
const override = require('method-override');
const path = require('path');
const db = require('./config/db');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/main');

app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(express.urlencoded({
    extended: false
}));

app.use(express.json());
app.use(override('_method'));

app.use(express.static(
    path.join(__dirname, 'public')
));

app.use(session({
    name: 'ems.sid',
    secret: process.env.SESSION_SECRET || 'change-this-local-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 14400000
    }
}));

app.use(flash());
app.use(layouts);

app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    res.locals.messages = {
        error: req.flash('error'),
        success: req.flash('success')
    };
    res.locals.currentPath = req.path;
    next();
});

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/dashboard'));
app.use('/admin', require('./routes/admin'));
app.use('/employee', require('./routes/employee'));

app.use((req, res) => {
    res.status(404).render('error', {
        title: 'Not Found',
        message: 'The requested page does not exist.'
    });
});

app.use((err, req, res, next) => {
    console.error(err);
    req.flash('error', 'An error occurred. Check the details and try again.');
    res.redirect(req.get('Referrer') || '/dashboard');
});

const port = Number(process.env.PORT || 3000);

db.getConnection()
    .then(connection => {
        connection.release();
        app.listen(port, () => {
            console.log('EMS running at http://localhost:' + port);
        });
    })
    .catch(error => {
        console.error('MySQL connection failed:', error.message);
        process.exit(1);
    });
