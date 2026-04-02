const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

// GET /api/learnings
router.get('/', async (req, res) => {
  try {
    const [
      summary,
      byHookVirality,
      byFormatVirality,
      byCtaVirality,
      topViral,
      byHookConversion,
      byFormatConversion,
      signalBreakdown,
      topConverters,
      winners,
    ] = await Promise.all([
      // Summary
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'posted') AS total_posted,
          COUNT(*) FILTER (WHERE status = 'posted' AND virality_rating IS NOT NULL) AS total_rated,
          COUNT(*) FILTER (WHERE status = 'posted' AND conversion_signal IS NOT NULL AND conversion_signal != '') AS total_conversions,
          ROUND(AVG(virality_rating) FILTER (WHERE status = 'posted' AND virality_rating IS NOT NULL), 1) AS avg_virality,
          COUNT(*) FILTER (WHERE is_winner = true) AS total_winners
        FROM posts
      `),
      // Hook → virality
      pool.query(`
        SELECT tag_hook AS label, COUNT(*) AS count,
               ROUND(AVG(virality_rating), 1) AS avg_rating
        FROM posts
        WHERE status = 'posted' AND tag_hook IS NOT NULL AND virality_rating IS NOT NULL
        GROUP BY tag_hook ORDER BY avg_rating DESC
      `),
      // Format → virality
      pool.query(`
        SELECT tag_format AS label, COUNT(*) AS count,
               ROUND(AVG(virality_rating), 1) AS avg_rating
        FROM posts
        WHERE status = 'posted' AND tag_format IS NOT NULL AND virality_rating IS NOT NULL
        GROUP BY tag_format ORDER BY avg_rating DESC
      `),
      // CTA → virality
      pool.query(`
        SELECT tag_cta AS label, COUNT(*) AS count,
               ROUND(AVG(virality_rating), 1) AS avg_rating
        FROM posts
        WHERE status = 'posted' AND tag_cta IS NOT NULL AND virality_rating IS NOT NULL
        GROUP BY tag_cta ORDER BY avg_rating DESC
      `),
      // Top viral posts (rated 4+)
      pool.query(`
        SELECT p.id, p.content, p.virality_rating, p.tag_format, p.tag_hook, p.tag_cta,
               p.conversion_signal, p.performance_notes, p.is_winner, p.updated_at,
               c.name AS client_name
        FROM posts p JOIN clients c ON c.id = p.client_id
        WHERE p.status = 'posted' AND p.virality_rating >= 4
        ORDER BY p.virality_rating DESC, p.updated_at DESC LIMIT 12
      `),
      // Hook → conversion rate
      pool.query(`
        SELECT tag_hook AS label,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE conversion_signal IS NOT NULL AND conversion_signal != '') AS conversions
        FROM posts
        WHERE status = 'posted' AND tag_hook IS NOT NULL
        GROUP BY tag_hook HAVING COUNT(*) > 0
        ORDER BY (COUNT(*) FILTER (WHERE conversion_signal IS NOT NULL AND conversion_signal != ''))::float / COUNT(*) DESC
      `),
      // Format → conversion rate
      pool.query(`
        SELECT tag_format AS label,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE conversion_signal IS NOT NULL AND conversion_signal != '') AS conversions
        FROM posts
        WHERE status = 'posted' AND tag_format IS NOT NULL
        GROUP BY tag_format HAVING COUNT(*) > 0
        ORDER BY (COUNT(*) FILTER (WHERE conversion_signal IS NOT NULL AND conversion_signal != ''))::float / COUNT(*) DESC
      `),
      // Conversion signal breakdown
      pool.query(`
        SELECT conversion_signal AS signal, COUNT(*) AS count
        FROM posts
        WHERE status = 'posted' AND conversion_signal IS NOT NULL AND conversion_signal != ''
        GROUP BY conversion_signal ORDER BY count DESC
      `),
      // Best converting posts
      pool.query(`
        SELECT p.id, p.content, p.conversion_signal, p.tag_format, p.tag_hook,
               p.virality_rating, p.performance_notes, p.is_winner, p.updated_at,
               c.name AS client_name
        FROM posts p JOIN clients c ON c.id = p.client_id
        WHERE p.status = 'posted' AND p.conversion_signal IS NOT NULL AND p.conversion_signal != ''
        ORDER BY CASE p.conversion_signal
          WHEN 'deal' THEN 1 WHEN 'lead' THEN 2 WHEN 'meeting' THEN 3
          WHEN 'dms' THEN 4 WHEN 'connections' THEN 5 ELSE 6 END, p.updated_at DESC LIMIT 12
      `),
      // Winners library
      pool.query(`
        SELECT p.id, p.content, p.virality_rating, p.conversion_signal,
               p.tag_format, p.tag_hook, p.tag_cta, p.performance_notes, p.updated_at,
               c.name AS client_name
        FROM posts p JOIN clients c ON c.id = p.client_id
        WHERE p.is_winner = true
        ORDER BY p.updated_at DESC
      `),
    ]);

    res.json({
      summary: summary.rows[0],
      virality: {
        by_hook: byHookVirality.rows,
        by_format: byFormatVirality.rows,
        by_cta: byCtaVirality.rows,
        top_posts: topViral.rows,
      },
      conversion: {
        by_hook: byHookConversion.rows,
        by_format: byFormatConversion.rows,
        signal_breakdown: signalBreakdown.rows,
        top_posts: topConverters.rows,
      },
      winners: winners.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
