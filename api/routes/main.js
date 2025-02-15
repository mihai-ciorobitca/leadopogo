// routes/main.js

const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseKey);

const router = express.Router();

router.use(session({
    secret: process.env.SECRET_KEY || 'default_secret', // Provide a default secret
    resave: false,
    saveUninitialized: true,
}));

router.get('/', async (req, res) => {
    if (req.session.username) {
        const username = req.session.username;
        const { data: user, error: fetchError } = await supabaseClient
            .from('users')
            .select('code, credits')
            .eq('username', req.session.username)
            .single();
        return res.render('home', {
            username: username,
            credits: user.credits,
            code: user.code,
            is_admin: req.session.is_admin
        });
    }
    return res.redirect('/login');
});

module.exports = router;