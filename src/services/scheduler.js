const pool = require('../db');
const { decrypt } = require('./encryption');
const { createPost } = require('./linkedin');

async function runScheduledPosts() {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.content, p.client_id,
              c.linkedin_access_token, c.linkedin_person_urn,
              c.linkedin_token_expires_at, c.name AS client_name
       FROM posts p
       JOIN clients c ON c.id = p.client_id
       WHERE p.status = 'scheduled' AND p.scheduled_at <= NOW()`
    );

    for (const post of rows) {
      try {
        if (!post.linkedin_access_token || !post.linkedin_person_urn) {
          console.log(`Scheduler: skipping post ${post.id} (${post.client_name}) — no LinkedIn token`);
          await pool.query("UPDATE posts SET status = 'approved', scheduled_at = NULL WHERE id = $1", [post.id]);
          continue;
        }
        if (new Date(post.linkedin_token_expires_at) < new Date()) {
          console.log(`Scheduler: skipping post ${post.id} (${post.client_name}) — token expired`);
          await pool.query("UPDATE posts SET status = 'approved', scheduled_at = NULL WHERE id = $1", [post.id]);
          continue;
        }

        const accessToken = decrypt(post.linkedin_access_token);
        const result = await createPost(accessToken, post.linkedin_person_urn, post.content);

        if (result.status === 201) {
          const linkedinPostId = result.body.id || 'unknown';
          await pool.query(
            "UPDATE posts SET status = 'posted', linkedin_post_id = $1 WHERE id = $2",
            [linkedinPostId, post.id]
          );
          console.log(`Scheduler: published post ${post.id} for ${post.client_name}`);
        } else {
          console.error(`Scheduler: LinkedIn API error for post ${post.id}:`, result.status, result.body);
        }
      } catch (err) {
        console.error(`Scheduler: error on post ${post.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Scheduler run error:', err.message);
  }
}

function start() {
  console.log('Post scheduler started (checking every 60s)');
  runScheduledPosts();
  setInterval(runScheduledPosts, 60 * 1000);
}

module.exports = { start };
