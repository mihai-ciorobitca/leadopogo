// routes/resetPassword.js

const express = require('express');
const session = require('express-session');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const speakeasy = require('speakeasy');
const crypto = require('crypto');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseKey);

router.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
}));

router.get('/', (_, res) => {
    res.render('recover');
});

router.post('/', async (req, res) => {
    const { username, secretCode, newPassword } = req.body;

    const { data: user, error } = await supabaseClient
        .from('users')
        .select('recovery_code')
        .eq('username', username)
        .maybeSingle();

    if (error) {
        console.error('Error fetching user:', error);
        return res.status(500).send('Internal Server Error');
    }

    if (!user) {
        return res.status(400).render('recover', { error: 'Username not exist' });
    }

    const verified = speakeasy.totp.verify({
        secret: user.recovery_code,
        encoding: 'base32',
        token: secretCode
    });

    if (!verified) {
        return res.status(400).render('recover', { error: 'Invalid OTP Code' });
    }

    const hashedPassword = crypto.createHash('sha256').update(newPassword).digest('hex');

    const { error: updateError } = await supabaseClient
        .from('users')
        .update({ password: hashedPassword })
        .eq('username', username);

    if (updateError) {
        console.error('Error updating password:', updateError);
        return res.status(500).send('Internal Server Error');
    }

    res.redirect('/login');
});

module.exports = router;