require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const pool = require('./db');

const app = express();

// Auto-migrations
const migrations = [
  `CREATE TABLE IF NOT EXISTS linkedin_auth_invitations (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS voice_tone TEXT`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS content_pillars TEXT`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS topics_to_avoid TEXT`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT`,
  `CREATE TABLE IF NOT EXISTS prompts (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS client_notes (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    section VARCHAR(50) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, section)
  )`,
  `CREATE TABLE IF NOT EXISTS ideas (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    notes TEXT,
    content_pillar TEXT,
    source TEXT,
    status TEXT NOT NULL DEFAULT 'idea',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS client_transcripts (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    title TEXT,
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];
(async () => {
  for (const sql of migrations) {
    await pool.query(sql).catch((err) => console.error('Migration error:', err.message));
  }
})();

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
app.use('/api/prompts', require('./routes/prompts'));
app.use('/api/ideas', require('./routes/ideas'));
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
    require('./services/scheduler').start();
  });
}

module.exports = app;
