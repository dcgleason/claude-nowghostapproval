require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();

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
app.use('/linkedin', require('./routes/linkedin'));

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
