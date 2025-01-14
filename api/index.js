const express = require('express');
const session = require('express-session');
const path = require('path');

require('dotenv').config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Import routes
const mainRoutes = require('./routes/main');
const homeRoutes = require('./routes/home');
const loginRoutes = require('./routes/login');
const registerRoutes = require('./routes/register');
const recoverRoutes = require('./routes/recover');
const logoutRoutes = require('./routes/logout');
const adminRoutes = require('./routes/admin');
const filterRoutes = require('./routes/filter');

// Use routes
app.use('/', mainRoutes);
app.use('/login', loginRoutes);
app.use('/register', registerRoutes);
app.use('/recover', recoverRoutes);
app.use('/logout', logoutRoutes);
app.use('/home', homeRoutes);
app.use('/admin', adminRoutes);
app.use('/filter', filterRoutes);

app.use((err, req, res, next) => {
    console.error('Error occurred:', err);
    return res.status(500).send('Internal Server Error');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});