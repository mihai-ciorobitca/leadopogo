// routes/logout.js

const express = require('express');
const session = require('express-session');
const router = express.Router();

router.use(session({
    secret: process.env.SECRET_KEY || 'default_secret', // Provide a default secret
    resave: false,
    saveUninitialized: true,
}));

router.post('/', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Internal Server Error');
        }
        res.redirect('/login');
    });
});

module.exports = router;