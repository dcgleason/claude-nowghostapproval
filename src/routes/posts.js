const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { sendApprovalEmail } = require('../services/email');
const { createPost } = require('../services/linkedin');
const { decrypt } = require('../services/encryption');

const router = express.Router();
router.use(requireAuth);

// GET /posts — list all posts with client name
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.content, p.status, p.linkedin_post_id,
              p.scheduled_at, p.created_at, p.updated_at,
              c.id AS client_id, c.name AS client_name, c.email AS client_email
       FROM posts p
       JOIN clients c ON c.id = p.client_id
       ORDER BY p.updated_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /posts/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.name AS client_name, c.email AS client_email,
              c.linkedin_person_urn, c.linkedin_token_expires_at
       FROM posts p
       JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    // Get latest approval for this post
    const { rows: approvals } = await pool.query(
      `SELECT id, response, client_comment, responded_at, expires_at, created_at
       FROM approvals WHERE post_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.id]
    );
    res.json({ ...rows[0], latest_approval: approvals[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /posts
router.post('/', async (req, res) => {
  const { client_id, content } = req.body;
  if (!client_id || !content) return res.status(400).json({ error: 'client_id and content required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO posts (client_id, content) VALUES ($1, $2) RETURNING *',
      [client_id, content]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /posts/:id
router.put('/:id', async (req, res) => {
  const { content } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE posts SET content = COALESCE($1, content)
       WHERE id = $2 AND status IN ('draft', 'rejected')
       RETURNING *`,
      [content, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found or post cannot be edited' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /posts/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /posts/:id/schedule — schedule an approved post for a specific time
router.post('/:id/schedule', async (req, res) => {
  const { scheduled_at } = req.body;
  if (!scheduled_at) return res.status(400).json({ error: 'scheduled_at is required' });
  const scheduledDate = new Date(scheduled_at);
  if (isNaN(scheduledDate.getTime())) return res.status(400).json({ error: 'Invalid date' });
  if (scheduledDate < new Date()) return res.status(400).json({ error: 'Scheduled time must be in the future' });
  try {
    const { rows } = await pool.query(
      `UPDATE posts SET status = 'scheduled', scheduled_at = $1
       WHERE id = $2 AND status IN ('approved', 'scheduled')
       RETURNING *`,
      [scheduledDate, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Post not found or not in approved/scheduled state' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /posts/:id/schedule — unschedule, revert to approved
router.delete('/:id/schedule', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE posts SET status = 'approved', scheduled_at = NULL
       WHERE id = $1 AND status = 'scheduled'
       RETURNING *`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Post not found or not scheduled' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /posts/:id/send-approval
router.post('/:id/send-approval', async (req, res) => {
  try {
    const { rows: postRows } = await pool.query(
      `SELECT p.*, c.name AS client_name, c.email AS client_email
       FROM posts p JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    const post = postRows[0];
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status === 'posted') return res.status(400).json({ error: 'Post already published' });

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO approvals (post_id, token, expires_at) VALUES ($1, $2, $3)',
      [post.id, token, expiresAt]
    );
    await pool.query('UPDATE posts SET status = $1 WHERE id = $2', ['pending', post.id]);

    try {
      await sendApprovalEmail({
        clientEmail: post.client_email,
        clientName: post.client_name,
        postContent: post.content,
        approvalToken: token,
      });
    } catch (emailErr) {
      console.error('Email send failed:', emailErr.message, emailErr);
      // Don't fail the whole request — post is pending, return token so it can be resent
      return res.json({ ok: true, token, emailWarning: emailErr.message });
    }

    res.json({ ok: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /posts/:id/publish — post approved content to LinkedIn
router.post('/:id/publish', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.linkedin_access_token, c.linkedin_person_urn,
              c.linkedin_token_expires_at, c.name AS client_name
       FROM posts p JOIN clients c ON c.id = p.client_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    const post = rows[0];
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status !== 'approved') {
      return res.status(400).json({ error: 'Post must be approved before publishing' });
    }
    if (!post.linkedin_access_token || !post.linkedin_person_urn) {
      return res.status(400).json({ error: 'Client LinkedIn account not connected' });
    }
    if (new Date(post.linkedin_token_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Client LinkedIn token has expired — reconnect their account' });
    }

    const accessToken = decrypt(post.linkedin_access_token);
    const result = await createPost(accessToken, post.linkedin_person_urn, post.content);

    if (result.status !== 201) {
      console.error('LinkedIn post failed:', result.body);
      return res.status(502).json({ error: 'LinkedIn API error', details: result.body });
    }

    // LinkedIn returns the post ID in the X-RestLi-Id header via body id or header
    const linkedinPostId = result.body.id || result.body['id'] || 'unknown';

    await pool.query(
      'UPDATE posts SET status = $1, linkedin_post_id = $2 WHERE id = $3',
      ['posted', linkedinPostId, post.id]
    );

    res.json({ ok: true, linkedinPostId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
