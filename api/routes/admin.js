const express = require('express');
const session = require('express-session');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabase_client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

router.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
}));

router.get('/', async (req, res) => {
    if (req.session.admin) {
        try {
            const { data: users, error: fetchError } = await supabase_client
                .from('users')
                .select('*')
                .order('username', { ascending: true });
            if (fetchError) {
                console.error(fetchError);
                return res.status(500).send('Error fetching users');
            }
            return res.render('admin', { users, session: req.session });
        } catch (error) {
            console.error('Error fetching users for admin:', error);
            res.status(500).send('Internal Server Error');
        }
    }
    return res.redirect('/login');
});

router.post('/buy-credits', async (req, res) => {
    // ...existing code...
});

router.post('/clear-credits', async (req, res) => {
    // ...existing code...
});

router.post('/update-status', async (req, res) => {
    // ...existing code...
});

router.post('/delete-account', async (req, res) => {
    // ...existing code...
});

router.post('/home', async (req, res) => {
    // ...existing code...
});

module.exports = router;
