// routes/register.js

const express = require('express');
const router = express.Router();
const svgCaptcha = require('svg-captcha');
const speakeasy = require('speakeasy');
const crypto = require('crypto');

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseClient = createClient(supabaseUrl, supabaseKey);

router.get('/', (req, res) => {
    res.render('register');
});

router.post('/', async (req, res) => {
    const { username, password, captcha } = req.body;

    const hashedCaptcha = crypto.createHash('sha256').update(captcha).digest('hex');

    if (hashedCaptcha !== req.session.captcha) {
        return res.status(400).render('register', { error: `Invalid captcha` });
    }

    const { data: existingUser, error: fetchError } = await supabaseClient
        .from('users')
        .select('*')
        .eq('username', username)
        .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error checking user existence:', fetchError);
        return res.status(500).send('Internal Server Error');
    }

    if (existingUser) {
        return res.status(400).render('register', { error: 'User already exists' });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    const secret = speakeasy.generateSecret({ length: 20 });

    const { error: insertError } = await supabaseClient
        .from('users')
        .insert([{ username, password: hashedPassword, recovery_code: secret.base32 }]);

    if (insertError) {
        console.error('Error registering user:', insertError);
        return res.status(500).send('Internal Server Error');
    }

    const qrCodeUrl = speakeasy.otpauthURL({ secret: secret.base32, label: username, issuer: 'Monthly Book' });
    const qrCodeBase64 = await new Promise((resolve, reject) => {
        require('qrcode').toDataURL(qrCodeUrl, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });

    req.session.secretCode = secret.base32;
    req.session.qrCodeBase64 = qrCodeBase64;

    res.redirect('/qrcode');
});

router.get('/captcha', (req, res) => {
    const captcha = svgCaptcha.create();
    const hashedCaptcha = crypto.createHash('sha256').update(captcha.text).digest('hex');
    req.session.captcha = hashedCaptcha;
    res.type('svg');
    res.status(200).send(captcha.data);
});

module.exports = router;