const express = require('express');
const pool = require('../db');

const router = express.Router();

const BASE_STYLE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { background: #fff; border-radius: 16px; width: 100%; max-width: 480px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.1); }
  .header { background: #0a66c2; padding: 28px 32px; display: flex; align-items: center; gap: 14px; }
  .header-icon { font-size: 32px; }
  .header-brand { color: #fff; font-size: 20px; font-weight: 700; line-height: 1.1; }
  .header-tagline { color: #cce4ff; font-size: 13px; margin-top: 3px; }
  .body { padding: 32px; }
  h2 { font-size: 20px; font-weight: 700; color: #111; margin-bottom: 8px; }
  .sub { color: #6b7280; font-size: 14px; margin-bottom: 24px; line-height: 1.6; }
  .info-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px 18px; margin-bottom: 24px; }
  .info-box p { color: #1e40af; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  .info-box ul { color: #1e40af; font-size: 13px; padding-left: 18px; line-height: 1.9; }
  .btn-linkedin { display: block; text-align: center; background: #0a66c2; color: #fff; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-size: 16px; font-weight: 600; transition: background .15s; }
  .btn-linkedin:hover { background: #004182; }
  .footer { color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px; }
  .error-icon { font-size: 48px; text-align: center; margin-bottom: 16px; }
  .error-title { font-size: 20px; font-weight: 700; color: #111; text-align: center; margin-bottom: 8px; }
  .error-msg { color: #6b7280; font-size: 14px; text-align: center; line-height: 1.6; }
  .success-icon { font-size: 56px; text-align: center; margin-bottom: 16px; }
  .success-title { font-size: 22px; font-weight: 700; color: #111; text-align: center; margin-bottom: 8px; }
  .success-msg { color: #6b7280; font-size: 14px; text-align: center; line-height: 1.6; }
  .success-check { background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 18px; margin: 20px 0; }
  .success-check p { color: #15803d; font-size: 14px; text-align: center; }
`;

function page(bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Now Ghost — LinkedIn Connection</title>
  <style>${BASE_STYLE}</style>
</head>
<body>${bodyContent}</body>
</html>`;
}

function brandHeader() {
  return `
    <div class="header">
      <div class="header-icon">👻</div>
      <div>
        <div class="header-brand">The Now Ghost</div>
        <div class="header-tagline">LinkedIn Ghostwriting for the ServiceNow Ecosystem</div>
      </div>
    </div>`;
}

// GET /linkedin-auth/success
router.get('/success', (req, res) => {
  res.send(page(`
    <div class="card">
      ${brandHeader()}
      <div class="body">
        <div class="success-icon">🎉</div>
        <div class="success-title">You're all connected!</div>
        <div class="success-msg">Your LinkedIn account is now linked to The Now Ghost. You'll continue receiving posts for review before anything is published.</div>
        <div class="success-check"><p>✓ Your ghostwriter has been notified</p></div>
        <div class="footer">You can close this tab.</div>
      </div>
    </div>
  `));
});

// GET /linkedin-auth/error?reason=X
router.get('/error', (req, res) => {
  const reason = req.query.reason || 'unknown';
  const messages = {
    not_found: { title: 'Link not found', msg: 'This invitation link is invalid or has already been removed. Ask your ghostwriter to send a new one.' },
    already_used: { title: 'Already connected', msg: 'This invitation link has already been used. If you need to reconnect, ask your ghostwriter to send a new link.' },
    expired: { title: 'Link expired', msg: 'This invitation link has expired (links are valid for 48 hours). Ask your ghostwriter to send a new one.' },
    linkedin_denied: { title: 'Authorization cancelled', msg: "It looks like you cancelled the LinkedIn authorization. If you'd like to try again, ask your ghostwriter for a new link." },
    token_exchange_failed: { title: 'Connection failed', msg: 'Something went wrong exchanging your LinkedIn credentials. Please ask your ghostwriter to send a new invitation link.' },
    server_error: { title: 'Something went wrong', msg: 'An unexpected error occurred. Please ask your ghostwriter to send a new invitation link.' },
  };
  const { title, msg } = messages[reason] || { title: 'Something went wrong', msg: 'Please ask your ghostwriter to send a new invitation link.' };

  res.send(page(`
    <div class="card">
      ${brandHeader()}
      <div class="body">
        <div class="error-icon">⚠️</div>
        <div class="error-title">${title}</div>
        <div class="error-msg" style="margin-top:8px">${msg}</div>
      </div>
    </div>
  `));
});

// GET /linkedin-auth/:token — invitation landing page
router.get('/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT li.*, c.name AS client_name
       FROM linkedin_auth_invitations li
       JOIN clients c ON c.id = li.client_id
       WHERE li.token = $1`,
      [token]
    );
    const invite = rows[0];

    if (!invite) return res.redirect('/linkedin-auth/error?reason=not_found');
    if (invite.used_at) return res.redirect('/linkedin-auth/error?reason=already_used');
    if (new Date(invite.expires_at) < new Date()) return res.redirect('/linkedin-auth/error?reason=expired');

    const hoursLeft = Math.ceil((new Date(invite.expires_at) - Date.now()) / 3600000);

    res.send(page(`
      <div class="card">
        ${brandHeader()}
        <div class="body">
          <h2>Hi ${escHtml(invite.client_name)} 👋</h2>
          <p class="sub">Your ghostwriter is ready to start publishing LinkedIn posts on your behalf. To do that, they need you to connect your LinkedIn account — it takes about 30 seconds.</p>
          <div class="info-box">
            <p>What you're granting permission for:</p>
            <ul>
              <li>Publishing posts to your LinkedIn profile</li>
              <li>You'll approve every post before it goes live</li>
              <li>You can disconnect at any time</li>
            </ul>
          </div>
          <a href="/linkedin/connect-invite?token=${escHtml(token)}" class="btn-linkedin">Connect LinkedIn →</a>
          <p class="footer">This link expires in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}. Questions? Reply to the email you received.</p>
        </div>
      </div>
    `));
  } catch (err) {
    console.error('linkedin-auth page error:', err);
    res.redirect('/linkedin-auth/error?reason=server_error');
  }
});

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = router;
