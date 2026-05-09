const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/landlord', require('./routes/landlord'));
app.use('/api/tenant',   require('./routes/tenant'));
app.use('/api/admin',    require('./routes/admin'));

// SPA-style fallback for clean URLs
app.get('/track/:token',         (req, res) => res.sendFile(path.join(__dirname, 'public/track.html')));
app.get('/landlord/:page?',      (req, res) => res.sendFile(path.join(__dirname, 'public/landlord/dashboard.html')));
app.get('/admin/:page?',         (req, res) => res.sendFile(path.join(__dirname, 'public/admin/dashboard.html')));

init().then(() => {
  app.listen(PORT, () => console.log(`Running on port ${PORT}`));
}).catch(err => { console.error('DB init failed:', err.message); process.exit(1); });
