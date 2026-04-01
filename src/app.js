require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const pool = require('./db');

const app = express();

// Auto-migrate: create linkedin_auth_invitations if it doesn't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS linkedin_auth_invitations (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch((err) => console.error('Migration error (linkedin_auth_invitations):', err));

app.use(express.json());
app.use(cookieParser());

// Static files
app.use('/dashboard', express.static(path.join(__dirname, '../public/dashboard')));
app.use('/approval', express.static(path.join(__dirname, '../public/approval')));
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/auth', require('./routes/auth'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/approvals', require('./routes/approvals'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/adlibrary', require('./routes/adlibrary'));
app.use('/linkedin', require('./routes/linkedin'));
app.use('/linkedin-auth', require('./routes/linkedinAuthPages'));

// Public approval page (token-based, no auth)
app.get('/review/:token', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/approval/index.html'));
});

// Root redirect
app.get('/', (req, res) => res.redirect('/dashboard/index.html'));

// Run locally
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`LinkedIn Approval Tool running on http://localhost:${PORT}`);
  });
}

module.exports = app;
