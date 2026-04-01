const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { decrypt } = require('../services/encryption');
const { getPostEngagement } = require('../services/linkedin');

const router = express.Router();
router.use(requireAuth);

// GET /api/analytics/:clientId
router.get('/:clientId', async (req, res) => {
  const { clientId } = req.params;

  try {
    // Client info + token
    const { rows: clientRows } = await pool.query(
      `SELECT id, name, email, linkedin_access_token, linkedin_person_urn,
              linkedin_token_expires_at, created_at
       FROM clients WHERE id = $1`,
      [clientId]
    );
    if (!clientRows[0]) return res.status(404).json({ error: 'Client not found' });
    const client = clientRows[0];

    // DB stats: post counts per status
    const { rows: statusRows } = await pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM posts WHERE client_id = $1
       GROUP BY status`,
      [clientId]
    );
    const statusMap = {};
    for (const r of statusRows) statusMap[r.status] = r.count;
    const total = Object.values(statusMap).reduce((a, b) => a + b, 0);
    const approved = statusMap.approved || 0;
    const rejected = statusMap.rejected || 0;
    const approvalDenom = approved + rejected;
    const approvalRate = approvalDenom > 0 ? Math.round((approved / approvalDenom) * 100) : null;

    // Posts this calendar month
    const { rows: monthRows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM posts
       WHERE client_id = $1
         AND date_trunc('month', created_at) = date_trunc('month', NOW())`,
      [clientId]
    );
    const postsThisMonth = monthRows[0]?.count || 0;

    // Average approval turnaround (hours): created_at → responded_at
    const { rows: turnaroundRows } = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (a.responded_at - p.created_at)) / 3600)::numeric(6,1) AS avg_hours
       FROM approvals a
       JOIN posts p ON p.id = a.post_id
       WHERE p.client_id = $1 AND a.responded_at IS NOT NULL`,
      [clientId]
    );
    const avgTurnaroundHours = turnaroundRows[0]?.avg_hours ?? null;

    // Posted posts with linkedin_post_id for engagement fetch
    const { rows: postedPosts } = await pool.query(
      `SELECT id, content, linkedin_post_id, updated_at AS posted_at
       FROM posts
       WHERE client_id = $1
         AND status = 'posted'
         AND linkedin_post_id IS NOT NULL
         AND linkedin_post_id != 'unknown'
       ORDER BY updated_at DESC
       LIMIT 20`,
      [clientId]
    );

    // Fetch LinkedIn engagement for each posted post
    let engagement = [];
    if (
      postedPosts.length > 0 &&
      client.linkedin_access_token &&
      new Date(client.linkedin_token_expires_at) > new Date()
    ) {
      const accessToken = decrypt(client.linkedin_access_token);
      engagement = await Promise.all(
        postedPosts.map(async (p) => {
          const data = await getPostEngagement(accessToken, p.linkedin_post_id);
          return {
            post_id: p.id,
            content: p.content,
            linkedin_post_id: p.linkedin_post_id,
            posted_at: p.posted_at,
            ...data,
          };
        })
      );
    } else {
      engagement = postedPosts.map((p) => ({
        post_id: p.id,
        content: p.content,
        linkedin_post_id: p.linkedin_post_id,
        posted_at: p.posted_at,
        reactions: null,
        comments: null,
        reposts: null,
        error: !client.linkedin_access_token ? 'not_connected' : 'token_expired',
      }));
    }

    const engagementTotals = engagement.reduce(
      (acc, e) => ({
        reactions: acc.reactions + (e.reactions || 0),
        comments: acc.comments + (e.comments || 0),
        reposts: acc.reposts + (e.reposts || 0),
      }),
      { reactions: 0, comments: 0, reposts: 0 }
    );

    res.json({
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        linkedin_connected: !!client.linkedin_access_token,
        linkedin_token_expires_at: client.linkedin_token_expires_at,
        client_since: client.created_at,
      },
      stats: {
        total,
        draft: statusMap.draft || 0,
        pending: statusMap.pending || 0,
        approved: statusMap.approved || 0,
        rejected: statusMap.rejected || 0,
        posted: statusMap.posted || 0,
        approval_rate: approvalRate,
        avg_turnaround_hours: avgTurnaroundHours ? parseFloat(avgTurnaroundHours) : null,
        posts_this_month: postsThisMonth,
      },
      engagement,
      engagement_totals: engagementTotals,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
