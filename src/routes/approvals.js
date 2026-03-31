const express = require('express');
const pool = require('../db');
const { sendDannyApprovedEmail, sendDannyRejectedEmail } = require('../services/email');

const router = express.Router();

// GET /api/approvals/:token — fetch post + client info for the approval page
router.get('/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.token, a.response, a.client_comment, a.expires_at,
              p.id AS post_id, p.content, p.status,
              c.name AS client_name
       FROM approvals a
       JOIN posts p ON p.id = a.post_id
       JOIN clients c ON c.id = p.client_id
       WHERE a.token = $1`,
      [req.params.token]
    );
    const approval = rows[0];
    if (!approval) return res.status(404).json({ error: 'Approval link not found' });
    if (new Date(approval.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This approval link has expired' });
    }
    res.json({
      postId: approval.post_id,
      content: approval.content,
      clientName: approval.client_name,
      status: approval.status,
      alreadyResponded: !!approval.response,
      response: approval.response,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/approvals/:token — submit approval decision
router.post('/:token', async (req, res) => {
  const { response, comment } = req.body;
  if (!['approved', 'rejected'].includes(response)) {
    return res.status(400).json({ error: 'response must be "approved" or "rejected"' });
  }
  try {
    const { rows } = await pool.query(
      `SELECT a.*, p.id AS post_id, c.name AS client_name
       FROM approvals a
       JOIN posts p ON p.id = a.post_id
       JOIN clients c ON c.id = p.client_id
       WHERE a.token = $1`,
      [req.params.token]
    );
    const approval = rows[0];
    if (!approval) return res.status(404).json({ error: 'Approval link not found' });
    if (new Date(approval.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This approval link has expired' });
    }
    if (approval.response) {
      return res.status(409).json({ error: 'Already responded', response: approval.response });
    }

    await pool.query(
      `UPDATE approvals SET response = $1, client_comment = $2, responded_at = NOW()
       WHERE token = $3`,
      [response, comment || null, req.params.token]
    );
    await pool.query('UPDATE posts SET status = $1 WHERE id = $2', [response, approval.post_id]);

    // Notify Danny
    if (response === 'approved') {
      await sendDannyApprovedEmail({
        clientName: approval.client_name,
        postId: approval.post_id,
        comment,
      });
    } else {
      await sendDannyRejectedEmail({
        clientName: approval.client_name,
        postId: approval.post_id,
        comment,
      });
    }

    res.json({ ok: true, response });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
