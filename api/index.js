const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

require('dotenv').config();

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const USERNAME_ADMIN = process.env.USERNAME_ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD;
const API_URL = process.env.API_URL;
const SESSION_ID = process.env.SESSION_ID;
const CSRF_TOKEN = process.env.CSRF_TOKEN;

const supabase_client = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
    if (req.session.username) {
        res.redirect('/home');
    } else {
        res.redirect('/login');
    }
});

app.get('/home', async (req, res) => {
    if (req.session.username) {
        res.render('home', {
            username: req.session.username,
            credits: req.session.credits,
            code: req.session.code
        });
    } else {
        res.redirect('/login');
    }
});

app.post('/home/create-task', async (req, res) => {
    try {
        // Extracting task-related information from the request body
        const taskName = req.body['task-name'];
        const taskSource = req.body['task-source'];
        const maxEmails = parseInt(req.body['task-emails']);
        const scrapeType = req.body['task-type'];

        // Fetch the user's existing tasks to check for duplicates
        const { data: existingTasks, error: fetchError } = await supabase_client
            .from('tasks')
            .select('*')
            .eq('username', req.session.username)
            .eq('task_name', taskName);

        if (fetchError) throw fetchError;

        if (existingTasks.length > 0) {
            return res.status(400).send({ message: 'Task with this name already exists.' });
        }

        // Check if the user has enough credits
        const credits = parseInt(req.session.credits);
        if (maxEmails > credits) {
            return res.status(400).send({ message: 'Not enough credits to create this task.' });
        }

        // Inserting the task into the 'tasks' table
        const { error: insertError } = await supabase_client
            .from('tasks') // Change this to the correct table name
            .insert([{
                username: req.session.username,
                task_name: taskName,
                task_source: taskSource,
                task_emails: maxEmails,
                task_type: scrapeType,
            }]);

        if (insertError) throw insertError;

        req.session.credits -= maxEmails;

        const { error: error } = await supabase_client
            .from('users')
            .update({ credits: req.session.credits })
            .eq('username', req.session.username);

        if (error) throw error;

        return res.redirect("/home");
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.get('/home/tasks', async (req, res) => {
    if (req.session.username) {
        try {
            const username = req.session.username;
            const { data: tasks, error } = await supabase_client
                .from('tasks')
                .select('*')
                .eq('username', username);
            if (error) throw error;
            return res.render("tasks", { tasks });
        } catch (error) {
            console.error('Error fetching tasks:', error);
            res.status(500).send('Internal Server Error');
        }
    }
    res.redirect("/login");
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (username === USERNAME_ADMIN && password === ADMIN_PASSWORD) {
        req.session.is_admin = true;
        return res.json({ result: 'admin' });
    }

    if (username === USERNAME_ADMIN && password === SUPERADMIN_PASSWORD) {
        req.session.is_superadmin = true;
        req.session.is_admin = true;
        return res.json({ result: 'admin' });
    }

    const { data: user, error } = await supabase_client
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

    if (error) throw error;

    if (user && await bcrypt.compare(password, user.password)) {
        req.session.username = username;
        req.session.credits = user.credits;
        req.session.code = user.code;
        return res.json({ result: 'home' });
    } else {
        return res.json({ result: 'error' });
    }
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { username, password, email } = req.body;

    try {
        // Check if the username already exists
        const { count: userCount, error: fetchUserError } = await supabase_client
            .from('users')
            .select('username', { count: 'exact' })
            .eq('username', username);

        if (fetchUserError) throw fetchUserError;

        if (userCount > 0) {
            return res.json({ result: 'exist-user' });
        }

        // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate a Google Authenticator secret
        const secret = speakeasy.generateSecret({ name: `YourAppName (${username})` });

        // Insert the new user with hashed password and secret
        const { error: insertError } = await supabase_client
            .from('users')
            .insert([{
                username,
                password: hashedPassword,
                code: secret.base32,  // Store the secret in the `code` field
                status: 'unconfirmed'
            }]);

        if (insertError) throw insertError;
        return res.redirect("/login")

    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/admin', async (req, res) => {
    if (req.session.is_admin) {
        try {
            const { data: users, error: fetchError } = await supabase_client
                .from('users')
                .select('*');
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
    res.redirect('/login');
});

app.post('/admin/buy-credits', async (req, res) => {
    const { username, credits } = req.body;
    try {
        const { data: user, error } = await supabase_client
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
        if (error) throw error;
        if (user) {
            const newCredits = user.credits + parseInt(credits, 10);
            const { error: updateError } = await supabase_client
                .from('users')
                .update({ credits: newCredits })
                .eq('username', username);
            if (updateError) throw updateError;
            res.redirect('/admin');
        } else {
            res.send('User not found');
        }
    } catch (error) {
        console.error('Error buying credits:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/admin/clear-credits', async (req, res) => {
    const { username } = req.body;
    try {
        const { error } = await supabase_client
            .from('users')
            .update({ credits: 0 })
            .eq('username', username);
        if (error) throw error;
        res.redirect('/admin');
    } catch (error) {
        console.error('Error clearing credits:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/admin/update-status', async (req, res) => {
    const { username, status } = req.body;
    try {
        const { error } = await supabase_client
            .from('users')
            .update({ status })
            .eq('username', username);
        if (error) throw error;
        res.redirect('/admin');
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/admin/delete-account', async (req, res) => {
    const { username } = req.body;
    try {
        const { error } = await supabase_client
            .from('users')
            .delete()
            .eq('username', username);
        if (error) throw error;
        res.redirect('/admin');
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/admin/home', async (req, res) => {
    const { username } = req.body;
    try {
        const { data: user, error } = await supabase_client
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error) throw error;

        req.session.username = username;
        req.session.credits = user.credits;
        req.session.code = user.email;
        res.redirect('/home');
    } catch (error) {
        console.error('Error during admin home redirection:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/logout', (req, res) => {
    console.log('Logout route reached');
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Failed to log out');
        }
        res.redirect('/login');
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error occurred:', err);
    res.status(500).send('Internal Server Error');
});

const scrapeData = async () => {
    try {
        const response = await axios.get(API_URL, {
            headers: {
                'Cookie': `sessionid=${SESSION_ID}; csrftoken=${CSRF_TOKEN}`,
            },
        });
        const $ = cheerio.load(response.data);
        const tableData = [];
        $('table tr').each((index, element) => {
            if (index === 0) return;

            const row = $(element);
            const downloadLinks = [];

            row.find('td').eq(4).find('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href) {
                    downloadLinks.push(href);
                }
            });
            const data = {
                source: row.find('td').eq(0).text().trim(),
                sourceType: row.find('td').eq(1).text().trim(),
                maxLeads: row.find('td').eq(2).text().trim(),
                scrapedLeads: row.find('td').eq(3).text().trim(),
                downloadLinks: downloadLinks.length > 0 ? downloadLinks : ['N/A'],
                orderStatus: row.find('td').eq(5).text().trim(),
            };
            tableData.push(data);
        });
        return tableData;
    } catch (error) {
        console.error('Error scraping data:', error);
        throw error;
    }
};

const postTask = async (source_type, source, max_leads) => {
    try {
        const getResponse = await axios.get(url, {
            headers: {
                'Cookie': `sessionid=${SESSION_ID}; csrftoken=${CSRF_TOKEN}`,
            }
        });
        const csrfMiddlewareTokenMatch = getResponse.data.match(/name="csrfmiddlewaretoken" value="([^"]+)"/);
        if (!csrfMiddlewareTokenMatch) {
            throw new Error('CSRF token not found');
        }
        const csrfMiddlewareToken = csrfMiddlewareTokenMatch[1];
        const postResponse = await axios.post(url, new URLSearchParams({
            source_type: source_type,
            source: source,
            max_leads: max_leads,
            csrfmiddlewaretoken: csrfMiddlewareToken,
        }).toString(), {
            headers: {
                'Cookie': `sessionid=${SESSION_ID}; csrftoken=${CSRF_TOKEN}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': url
            },
        });
        return postResponse.data;
    } catch (error) {
        console.error('Error posting task:', error);
        throw error;
    }
};

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
