const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

require('dotenv').config();

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const USERNAME_ADMIN = process.env.USERNAME_ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const API_URL = process.env.API_URL;
const SESSION_ID = process.env.SESSION_ID;
const CSRF_TOKEN = process.env.CSRF_TOKEN

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
        res.render('home', { username: req.session.username, credits: req.session.credits });
    } else {
        res.redirect('/login');
    }
});

app.post('/home/create-task', async (req, res) => {
    const taskName = req.body['task-name'];
    const scrapeInfo = req.body['scrape-info'];
    const maxEmails = req.body['max-emails'];
    const scrapeType = req.body['scrape-type'];
    const postResponse = await postTask(scrapeType, scrapeInfo, maxEmails);
    // subtract credits from database and session
    res.redirect("/home");
});


app.post('/home/tasks', async (req, res) => {
    const username = req.session.username;
    const { data: user, error } = await supabase_client
        .from('tasks')
        .select('*')
        .eq('username', username)
        .execute()
        .data;
    return data;
});

app.get('/login', (req, res) => {
    if (req.session.username) {
        return res.redirect('/home');
    }
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (username === USERNAME_ADMIN && password === ADMIN_PASSWORD) {
        req.session.is_admin = true;
        return res.json({ result: 'admin' });
    }
    const { data: user, error } = await supabase_client
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

    if (error) throw error;

    if (user && user.password === password) {
        req.session.username = username;
        req.session.credits = user.credits;
        return res.json({ result: 'home' });
    } else {
        return res.json({ result: 'error' });
    }
});

app.get('/register', (req, res) => {
    if (req.session.username) {
        return res.redirect('/home');
    }
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { username, password, email } = req.body;
    const { data: existingUser, error: fetchError } = await supabase_client
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

    if (fetchError) throw fetchError;

    if (existingUser) {
        res.json({ result: 'exist-user' });
        return;
    }

    const { data: existingEmail, error: emailError } = await supabase_client
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

    if (emailError) throw emailError;

    if (existingEmail) {
        res.json({ result: 'exist-email' });
        return;
    }

    const { error: insertError } = await supabase_client
        .from('users')
        .insert([{ username, password, email, status: 'unconfirmed' }]);

    if (insertError) throw insertError;

    res.json({ result: 'unconfirmed' });
});

app.get('/admin', async (req, res) => {
    if (req.session.is_admin) {
        const { data: users, error: fetchError } = await supabase_client
            .from('users')
            .select('*');
        if (fetchError) {
            console.error(fetchError);
            return res.status(500).send('Error fetching users');
        }
        return res.render('admin', { users, session: req.session });
    }
    res.redirect('/login');
});

app.post('/admin/buy-credits', async (req, res) => {
    const { username, credits } = req.body;
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
});

app.post('/admin/clear-credits', async (req, res) => {
    const { username } = req.body;
    const { error } = await supabase_client
        .from('users')
        .update({ credits: 0 })
        .eq('username', username);
    if (error) throw error;
    res.redirect('/admin');
});

app.post('/admin/update-status', async (req, res) => {
    const { username, status } = req.body;
    const { error } = await supabase_client
        .from('users')
        .update({ status })
        .eq('username', username);
    if (error) throw error;
    res.redirect('/admin');
});

app.post('/admin/delete-account', async (req, res) => {
    const { username } = req.body;
    const { error } = await supabase_client
        .from('users')
        .delete()
        .eq('username', username);
    if (error) throw error;
    res.redirect('/admin');
});

/*
app.post('/admin/tasks-manual', async (req, res) => {
    const { username } = req.body;
    res.redirect('/admin');
});
*/

app.post('/logout', (req, res) => {
    console.log('Logout route reached');
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Failed to log out');
        }
        res.redirect('/login');
    });
});

app.use((req, res) => {
    if (res.status(404)) {
        res.render('404', { url: req.url })
    } else if (res.status(405)) {
        res.render('405', { url: req.url })
    } else if (res.status(500)) {
        res.render('500', { url: req.url })
    }
})

const scrapeData = async () => {
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
};

const postTask = async (source_type, source, max_leads) => {
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
};

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
