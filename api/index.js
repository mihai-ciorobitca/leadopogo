const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();

// Supabase setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const USERNAME_ADMIN = process.env.USERNAME_ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const supabase_client = createClient(SUPABASE_URL, SUPABASE_KEY);

// Middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
}));

// Set up EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Routes

// Root Route
app.get('/', (req, res) => {
    if (req.session.username) {
        res.redirect('/home');
    } else {
        res.redirect('/login');
    }
});

// Home Route
app.get('/home', async (req, res) => {
    try {
        if (req.session.username) {
            const { data: user, error } = await supabase_client
                .from('users')
                .select('*')
                .eq('username', req.session.username)
                .single();

            if (error) throw error;

            if (user) {
                const credits = user.status !== "special" ? user.credits : -1;
                res.render('home', { username: req.session.username, credits: credits });
            } else {
                req.session.destroy(() => {
                    res.send('User does not exist');
                });
            }
        } else {
            //res.redirect('/login');
            res.render('home', { username: "test", credits: 0 });
        }
    } catch (error) {
        res.send(error.message);
    }
});

// Login Route (GET)
app.get('/login', (req, res) => {
    // If the user is already logged in, redirect to /home
    if (req.session.username) {
        return res.redirect('/home');
    }
    // Render the login page
    res.render('login');
});


// Login Route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Check for admin credentials
        if (username === USERNAME_ADMIN && password === ADMIN_PASSWORD) {
            req.session.is_admin = true;  // Set admin session
            //req.session.is_super = true;  // Set super admin session
            return res.json({ result: 'admin' });
        }
        const { data: user, error } = await supabase_client
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error) throw error;

        // Check for regular user credentials
        if (user && user.password === password) {
            req.session.username = username;
            return res.json({ result: 'home' });
        } else {
            return res.json({ result: 'error' });
        }
    } catch (error) {
        console.log(error);
        return res.json({ result: 'error' });
    }
});

// Login Route (GET)
app.get('/register', (req, res) => {
    if (req.session.username) {
        return res.redirect('/register');
    }
    // Render the register page
    res.render('register');
});

// Register Route
app.post('/register', async (req, res) => {
    const { username, password, email } = req.body;
    try {
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
    } catch (error) {
        res.json({ result: 'error' });
    }
});

// Admin Route (GET)
app.get('/admin', async (req, res) => {
    if (req.session.is_admin) {
        const { data: users, error: fetchError } = await supabase_client
            .from('users')
            .select('*'); // Fetch all users
        
        if (fetchError) {
            console.error(fetchError);
            return res.status(500).send('Error fetching users');
        }

        return res.render('admin', { users, session: req.session }); // Pass users and session to the view
    }
    res.redirect('/login'); // Redirect to login if not admin
});

// Admin Routes
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
        res.send(error.message);
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
        res.send(error.message);
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
        res.send(error.message);
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
        res.send(error.message);
    }
});

app.post('/admin/tasks-manual', async (req, res) => {
    const { username } = req.body;
    // Handle manual task assignment here
    res.redirect('/admin');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
