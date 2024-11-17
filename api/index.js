const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const { Readable } = require('stream');

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
        return res.redirect('/home');
    }
    return res.redirect('/login');
});

app.get('/home', async(req, res) => {
    if (req.session.username) {
        const username = req.session.username;
        const { data: user, error: fetchError } = await supabase_client
            .from('users')
            .select('code, credits')
            .eq('username', req.session.username)
            .single()
        return res.render('home', {
            username: username,
            credits: user.credits,
            code: user.code,
            is_admin: req.session.is_admin
        });
    }
    return res.redirect('/login');
});

app.post('/home/create-task', async(req, res) => {
    try {
        const taskName = req.body['task-name'];
        const taskSource = req.body['task-source'];
        const maxEmails = parseInt(req.body['task-emails']);
        const scrapeType = req.body['task-type'];

        const { data: existingTasks, error: fetchError } = await supabase_client
            .from('tasks')
            .select('*')
            .eq('username', req.session.username)
            .eq('task_name', taskName);

        if (fetchError) throw fetchError;
        if (existingTasks.length > 0) {
            return res.status(400).send({ message: 'Task with this name already exists.' });
        }

        const credits = parseInt(req.session.credits);
        if (maxEmails > credits) {
            return res.status(400).send({ message: 'Not enough credits to create this task.' });
        }

        const taskCreationResponse = await postTask(scrapeType, taskSource, maxEmails);

        const { error: insertError } = await supabase_client
            .from('tasks')
            .insert([{
                username: req.session.username,
                task_name: taskName,
                task_source: taskSource,
                task_emails: maxEmails,
                task_type: scrapeType,
            }]);

        if (insertError) throw insertError;

        req.session.credits -= maxEmails;
        const { error: updateError } = await supabase_client
            .from('users')
            .update({ credits: req.session.credits })
            .eq('username', req.session.username);

        if (updateError) throw updateError;

        console.log('Task created via postTask:', taskCreationResponse);

        return res.redirect("/home");
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/home/tasks', async(req, res) => {
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
    return res.redirect("/login");
});

app.get("/home/checker", async(req, res) => {
    if (req.session.username) {
        return res.render("checker");
    }
    return res.redirect("/login");
});

app.get("/home/filter", async(req, res) => {
    if (req.session.username) {
        return res.render("filter");
    }
    return res.redirect("/login");
});

app.post('/filter', async(req, res) => {
    try {
        const googleSheetsUrl = req.body.google_sheets_url;
        const categories = req.body.categories.split('\n').map(cat => cat.trim());
        const numbers = req.body.numbers.split('\n').map(num => num.trim());

        const response = await axios.get(googleSheetsUrl);
        const $ = cheerio.load(response.data);
        let filename = $('title').text();
        filename = filename.split('-').slice(0, -1).join('-').trim();

        const spreadsheetId = getSpreadsheetId(googleSheetsUrl);
        const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;

        const csvResponse = await axios.get(csvUrl);
        const csvData = csvResponse.data;
        console.log(csvData);

        const parsedData = [];
        Readable.from(csvData)
            .pipe(csv())
            .on('data', (row) => {
                parsedData.push(row);
            })
            .on('end', () => {
                const filteredData = removingData(parsedData, numbers, categories);
                const json2csvParser = new Parser();
                const csvOutput = json2csvParser.parse(filteredData);

                res.header('Content-Type', 'text/csv');
                res.attachment(`${filename}.csv`);
                res.send(csvOutput);
            });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('An error occurred while processing your request.');
    }
});

app.get('/login', (req, res) => {
    return res.render('login');
});

app.post('/login', async(req, res) => {
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
        .eq('username', username.toLowerCase())
        .single();
    if (error) throw error;
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.username = username;
        req.session.credits = user.credits;
        req.session.code = user.code;
        return res.json({ result: 'home' });
    }
    return res.json({ result: 'error' });
});

app.get('/recover', (req, res) => {
    return res.render('recover', { message: null });
});

app.post('/recover', async(req, res) => {
    const { username, secret, new_password } = req.body;
    try {
        console.log('Recover request body:', req.body);
        if (!new_password || new_password.trim() === '') {
            return res.render('recover', { message: 'New password is required.' });
        }
        const { data: user, error: userError } = await supabase_client
            .from('users')
            .select('code')
            .eq('username', username)
            .single();
        if (userError || !user) {
            return res.render('recover', { message: 'Invalid username or user does not exist' });
        }
        const code = user.code;
        if (!code) {
            return res.render('recover', { message: 'No OTP code found for this user.' });
        }
        const isOtpValid = speakeasy.totp.verify({
            secret: code,
            encoding: 'base32',
            token: secret,
            window: 1
        });
        if (isOtpValid) {
            const hashedPassword = await bcrypt.hash(new_password, 10);
            const { error: updateError } = await supabase_client
                .from('users')
                .update({
                    password: hashedPassword
                })
                .eq("username", username);
            if (updateError) {
                console.error('Error updating password:', updateError);
                return res.render('recover', { message: 'Failed to update password. Please try again.' });
            }
            return res.redirect("/login");
        }
        return res.render('recover', { message: 'Invalid OTP. Please try again.' });
    } catch (error) {
        console.error('Error during OTP verification:', error);
        return res.status(500).render('recover', { message: 'Internal Server Error' });
    }
});

app.get('/register', (req, res) => {
    return res.render('register');
});

app.post('/register', async(req, res) => {
    const { username, password } = req.body;
    try {
        const { count: userCount, error: fetchUserError } = await supabase_client
            .from('users')
            .select('username', { count: 'exact' })
            .eq('username', username);
        if (fetchUserError) throw fetchUserError;
        if (userCount > 0) {
            return res.json({ result: 'exist-user' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const secret = speakeasy.generateSecret({ name: `YourAppName (${username})` });
        const { error: insertError } = await supabase_client
            .from('users')
            .insert([{
                username: username.toLowerCase(),
                password: hashedPassword,
                code: secret.base32,
                status: 'unconfirmed'
            }]);
        if (insertError) {
            return res.json({ result: 'unexpected-error' });
        }
        return res.json({ result: 'user-registered' });
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/admin', async(req, res) => {
    if (req.session.is_admin) {
        try {
            const { data: users, error: fetchError } = await supabase_client
                .from('users')
                .select('*')
                .order('username', { ascending: true })
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

app.post('/admin/buy-credits', async(req, res) => {
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
        }
        return res.send('User not found');
    } catch (error) {
        console.error('Error buying credits:', error);
        return res.status(500).send('Internal Server Error');
    }
});

app.post('/admin/clear-credits', async(req, res) => {
    const { username } = req.body;
    try {
        const { error } = await supabase_client
            .from('users')
            .update({ credits: 0 })
            .eq('username', username);
        if (error) throw error;
        return res.redirect('/admin');
    } catch (error) {
        console.error('Error clearing credits:', error);
        return res.status(500).send('Internal Server Error');
    }
});

app.post('/admin/update-status', async(req, res) => {
    const { username, status } = req.body;
    try {
        const { error } = await supabase_client
            .from('users')
            .update({ status })
            .eq('username', username);
        if (error) throw error;
        return res.redirect('/admin');
    } catch (error) {
        console.error('Error updating status:', error);
        return res.status(500).send('Internal Server Error');
    }
});

app.post('/admin/delete-account', async(req, res) => {
    const { username } = req.body;
    try {
        const { error } = await supabase_client
            .from('users')
            .delete()
            .eq('username', username);
        if (error) throw error;
        return res.redirect('/admin');
    } catch (error) {
        console.error('Error deleting account:', error);
        return res.status(500).send('Internal Server Error');
    }
});

app.post('/admin/home', async(req, res) => {
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
        req.session.code = user.code;
        return res.redirect('/home');
    } catch (error) {
        console.error('Error during admin home redirection:', error);
        return res.status(500).send('Internal Server Error');
    }
});

app.post('/logout', (req, res) => {
    console.log('Logout route reached');
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Failed to log out');
        }
        return res.redirect('/login');
    });
});

app.use((err, req, res, next) => {
    console.error('Error occurred:', err);
    return res.status(500).send('Internal Server Error');
});

const scrapeData = async() => {
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

const postTask = async(source_type, source, max_leads) => {
    try {
        const getResponse = await axios.get(API_URL, {
            headers: {
                'Cookie': `sessionid=${SESSION_ID}; csrftoken=${CSRF_TOKEN}`,
            }
        });
        const csrfMiddlewareTokenMatch = getResponse.data.match(/name="csrfmiddlewaretoken" value="([^"]+)"/);
        if (!csrfMiddlewareTokenMatch) {
            throw new Error('CSRF token not found');
        }
        const csrfMiddlewareToken = csrfMiddlewareTokenMatch[1];
        const postResponse = await axios.post(API_URL, new URLSearchParams({
            source_type: source_type,
            source: source,
            max_leads: max_leads,
            csrfmiddlewaretoken: csrfMiddlewareToken,
        }).toString(), {
            headers: {
                'Cookie': `sessionid=${SESSION_ID}; csrftoken=${CSRF_TOKEN}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': API_URL
            },
        });
        return postResponse.data;
    } catch (error) {
        console.error('Error posting task:', error);
        throw error;
    }
};

function getSpreadsheetId(googleSheetsUrl) {
    const pattern = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const match = googleSheetsUrl.match(pattern);
    return match ? match[1] : null;
}

function removingData(data, numbers, category) {
    const phoneColumn = 'phoneColumn';
    const categoryColumn = 'categoryColumn';
    const initialCount = data.length;

    data = data.filter(row => row[phoneColumn] !== undefined && row[phoneColumn] !== null);

    data.forEach(row => {
        if (row[phoneColumn]) {
            row[phoneColumn] = String(row[phoneColumn]).replace("+", "");
            row[phoneColumn] = row[phoneColumn].endsWith('.0') ? row[phoneColumn].slice(0, -2) : row[phoneColumn];
        }
    });

    data = data.filter(row => {
        const startsWithCodes = numbers.some(code => row[phoneColumn].startsWith(code));
        return !startsWithCodes;
    });

    data.forEach(row => {
        if (row[categoryColumn]) {
            row[categoryColumn] = row[categoryColumn].toLowerCase();
        }
    });

    data = data.filter(row => !category.includes(row[categoryColumn]));

    const totalRemovedCount = initialCount - data.length;
    console.log('Total removed count:', totalRemovedCount);
    return data;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
