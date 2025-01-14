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
    const { credits, currentCredits, username } = req.body;

    try {
        const { data, error } = await supabase_client
            .from('users')
            .update({ credits: currentCredits + parseInt(credits) })
            .eq('username', username);

        if (error) {
            console.error('Error updating credits:', error);
            return res.status(500).send('Error updating credits');
        }

        return res.redirect('/admin');
    } catch (error) {
        console.error('Error processing buy credits request:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/clear-credits', async (req, res) => {
    const { username } = req.body;

    try {
        const { data, error } = await supabase_client
            .from('users')
            .update({ credits: 0 })
            .eq('username', username);

        if (error) {
            console.error('Error clearing credits:', error);
            return res.status(500).send('Error clearing credits');
        }

        return res.redirect('/admin');
    } catch (error) {
        console.error('Error processing clear credits request:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/delete-account', async (req, res) => {
    const { username } = req.body;

    try {
        const { data, error } = await supabase_client
            .from('users')
            .delete()
            .eq('username', username);

        if (error) {
            console.error('Error deleting account:', error);
            return res.status(500).send('Error deleting account');
        }

        return res.redirect('/admin');
    } catch (error) {
        console.error('Error processing delete account request:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/home', (req, res) => {
    const { username } = req.body;
    req.session.username = username;
    res.redirect('/home');
});

module.exports = router;
