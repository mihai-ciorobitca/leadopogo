const express = require('express');
const session = require('express-session');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const supabase_client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

router.use(session({
    secret: process.env.SECRET_KEY,
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

async function createExternalTask(taskSource, taskType, taskEmails, payload) {
    const apiUrl = `https://src-marketing101.com/api/orders/create/?source=${taskSource}&source_type=${taskType}&max_leads=${taskEmails}`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'X-API-Key': process.env.API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error('Failed to fetch data from external API');
    }

    return await response.json();
}

async function downloadExternalTask(taskId) {
    const apiUrl = `https://src-marketing101.com/api/orders/${taskId}/download`;
    const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'accept': '*/*',
            'X-API-Key': process.env.API_KEY
        }
    });

    if (!response.ok) {
        throw new Error('Failed to download data from external API');
    }

    return await response.blob();
}

async function checkExternalOrder(taskId) {
    const apiUrl = `https://src-marketing101.com/api/orders/${taskId}`;
    const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
            'accept': 'application/json',
            'X-API-Key': process.env.API_KEY
        }
    });

    if (!response.ok) {
        throw new Error('Failed to check order from external API');
    }

    return await response.json();
}

router.post('/create-task', async (req, res) => {
    if (req.session.username) {
        const { 'current-credits': currentCredits, 'task-name': taskName, 'task-source': taskSource, 'task-emails': taskEmails, 'task-type': taskType } = req.body;

        try {
            const responseData = await createExternalTask(taskSource, taskType, taskEmails);
            const externalId = responseData.id;

            const { data, error } = await supabase_client
                .from('tasks')
                .insert([
                    {
                        username: req.session.username,
                        task_name: taskName,
                        task_source: taskSource,
                        max_emails: taskEmails,
                        task_type: taskType,
                        task_id: externalId
                    }
                ]);

            if (error) {
                return res.status(500).json({ error: error.message });
            }

            // Update credits by subtracting max_emails
            const { data: updateData, error: updateError } = await supabase_client
                .from('users')
                .update({ credits: currentCredits - taskEmails })
                .eq('username', req.session.username);

            if (updateError) {
                return res.status(500).json({ error: updateError.message });
            }

            return res.redirect('/home/tasks');
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
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

router.get("/tasks/:id", async (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    const id = req.params.id;
    const { data: task, error: fetchError } = await supabase_client
        .from('tasks')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError) {
        return res.status(500).json({ error: fetchError.message });
    }

    try {

        const externalOrder = await checkExternalOrder(task.task_id);
        return res.render('task', { task: externalOrder });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.post('/tasks/:id/download', async (req, res) => {
    const { task_id: taskId } = req.body;
    try {
        const blob = await downloadExternalTask(taskId);
        const buffer = Buffer.from(await blob.arrayBuffer());
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${taskId}.csv`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/checker', async (req, res) => {
    // ...existing code...
});

router.get('/filter', async (req, res) => {
    // ...existing code...
});

module.exports = router;
