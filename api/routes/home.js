const express = require('express');
const session = require('express-session');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabase_client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

router.use(session({
    secret: process.env.SECRET_KEY || 'default_secret', // Provide a default secret
    resave: false,
    saveUninitialized: true,
}));

router.get('/', async (req, res) => {
    if (req.session.username) {
        const username = req.session.username;
        const { data: user, error: fetchError } = await supabase_client
            .from('users')
            .select('recovery_code, credits')
            .eq('username', req.session.username)
            .single();
        return res.render('home', {
            username: username,
            credits: user.credits,
            recovery_code: user.recovery_code,
            admin: req.session.admin
        });
    }
    return res.redirect('/login');
});

router.post('/create-task', async (req, res) => {
    if (req.session.username) {
        const { 'task-name': taskName, 'task-source': taskSource, 'task-emails': taskEmails, 'task-type': taskType } = req.body;

        const { data: task, error } = await supabase_client
            .from('tasks')
            .insert([
                {
                    username: req.session.username,
                    name: taskName,
                    source: taskSource,
                    max_emails: taskEmails,
                    type: taskType
                }
            ]);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        return res.redirect('/home/tasks');
    }
    return res.redirect('/login');
});

router.get('/tasks', async (req, res) => {
    if (req.session.username) {
        const { data: tasks, error } = await supabase_client
            .from('tasks')
            .select('*')
            .eq('username', req.session.username);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        return res.render('tasks', { tasks: tasks });
    }
    return res.redirect('/login');
});

router.get('/checker', async (req, res) => {
    // ...existing code...
});

router.get('/filter', async (req, res) => {
    // ...existing code...
});

module.exports = router;
