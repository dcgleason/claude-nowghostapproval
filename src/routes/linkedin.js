const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { encrypt, decrypt } = require('../services/encryption');
const { exchangeCodeForToken, getPersonUrn } = require('../services/linkedin');

const router = express.Router();

// GET /linkedin/connect?client_id=X — initiate OAuth flow
router.get('/connect', requireAuth, async (req, res) => {
  const { client_id } = req.query;
  if (!client_id) return res.status(400).send('client_id required');

  const state = crypto.randomBytes(16).toString('hex');
  // Store state + client_id in a short-lived cookie
  res.cookie('li_oauth_state', JSON.stringify({ state, client_id }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
    state,
    scope: 'openid profile w_member_social',
  });

  res.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`);
});

// GET /linkedin/callback — handle OAuth redirect
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect('/dashboard/clients.html?error=linkedin_denied');
  }

  let oauthCookie;
  try {
    oauthCookie = JSON.parse(req.cookies?.li_oauth_state || '{}');
  } catch {
    return res.redirect('/dashboard/clients.html?error=invalid_state');
  }

  if (!oauthCookie.state || oauthCookie.state !== state) {
    return res.redirect('/dashboard/clients.html?error=invalid_state');
  }

  res.clearCookie('li_oauth_state');
  const clientId = oauthCookie.client_id;

  try {
    const tokenResult = await exchangeCodeForToken(code);
    if (tokenResult.status !== 200 || !tokenResult.body.access_token) {
      console.error('LinkedIn token exchange failed:', tokenResult.body);
      return res.redirect('/dashboard/clients.html?error=token_exchange_failed');
    }

    const { access_token, expires_in } = tokenResult.body;
    const expiresAt = new Date(Date.now() + (expires_in || 5184000) * 1000); // default 60 days

    const personUrn = await getPersonUrn(access_token);
    const encryptedToken = encrypt(access_token);

    await pool.query(
      `UPDATE clients
       SET linkedin_access_token = $1,
           linkedin_token_expires_at = $2,
           linkedin_person_urn = $3
       WHERE id = $4`,
      [encryptedToken, expiresAt, personUrn, clientId]
    );

    res.redirect(`/dashboard/clients.html?connected=1&client_id=${clientId}`);
  } catch (err) {
    console.error('LinkedIn callback error:', err);
    res.redirect('/dashboard/clients.html?error=server_error');
  }
});

// POST /linkedin/disconnect/:client_id
router.post('/disconnect/:client_id', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE clients SET linkedin_access_token = NULL, linkedin_token_expires_at = NULL, linkedin_person_urn = NULL
       WHERE id = $1`,
      [req.params.client_id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
