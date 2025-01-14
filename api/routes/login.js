// routes/login.js

const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseKey);

const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;

const router = express.Router();

router.get('/', (_, res) => {
    res.render('login');
});

router.post('/', async (req, res) => {
    const { username, password } = req.body;

    if (username === adminUsername && password === adminPassword) {
        req.session.admin = true;
        return res.redirect('/admin');
    }

    const { data: user, error } = await supabaseClient
        .from('users')
        .select('*')
        .eq('username', username)
        .maybeSingle();

    if (error) {
        console.error('Error fetching user:', error);
        return res.status(500).send('Internal Server Error');
    }

    if (user && user.password === crypto.createHash('sha256').update(password).digest('hex')) {
        req.session.username = username;
        req.session.recoveryCode = user.recovery_code;
        res.redirect('/home');
    } else {
        res.render('login', { error: 'Invalid username or password' });
    }
});

module.exports = router;