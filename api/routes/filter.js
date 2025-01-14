const express = require('express');
const session = require('express-session');
const router = express.Router();

router.use(session({
    secret: process.env.SECRET_KEY || 'default_secret', // Provide a default secret
    resave: false,
    saveUninitialized: true,
}));

router.post('/', async (req, res) => {
    
});

module.exports = router;
