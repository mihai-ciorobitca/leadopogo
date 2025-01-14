const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabase_client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

router.get('/', async (req, res) => {
    if (req.session.username) {
        const username = req.session.username;
        const { data: user, error: fetchError } = await supabase_client
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

router.post('/create-task', async (req, res) => {
    // ...existing code...
});

router.get('/tasks', async (req, res) => {
    // ...existing code...
});

router.get('/checker', async (req, res) => {
    // ...existing code...
});

router.get('/filter', async (req, res) => {
    // ...existing code...
});

module.exports = router;
