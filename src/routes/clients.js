const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');
const { sendLinkedInAuthEmail } = require('../services/email');

const router = express.Router();
router.use(requireAuth);

// GET /clients
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, linkedin_person_urn, linkedin_token_expires_at,
              voice_tone, content_pillars, topics_to_avoid, notes, created_at
       FROM clients ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /clients/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, linkedin_person_urn, linkedin_token_expires_at,
              voice_tone, content_pillars, topics_to_avoid, notes, created_at
       FROM clients WHERE id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /clients
router.post('/', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id, name, email, created_at',
      [name, email]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /clients/:id
router.put('/:id', async (req, res) => {
  const { name, email, voice_tone, content_pillars, topics_to_avoid, notes } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE clients
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           voice_tone = COALESCE($3, voice_tone),
           content_pillars = COALESCE($4, content_pillars),
           topics_to_avoid = COALESCE($5, topics_to_avoid),
           notes = COALESCE($6, notes)
       WHERE id = $7
       RETURNING id, name, email, voice_tone, content_pillars, topics_to_avoid, notes`,
      [name || null, email || null, voice_tone ?? null, content_pillars ?? null,
       topics_to_avoid ?? null, notes ?? null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /clients/:id/send-linkedin-auth — send client a remote auth invite email
router.post('/:id/send-linkedin-auth', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, linkedin_person_urn FROM clients WHERE id = $1',
      [req.params.id]
    );
    const client = rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.linkedin_person_urn) {
      return res.status(400).json({ error: 'Client LinkedIn is already connected' });
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    await pool.query(
      'INSERT INTO linkedin_auth_invitations (client_id, token, expires_at) VALUES ($1, $2, $3)',
      [client.id, token, expiresAt]
    );

    try {
      await sendLinkedInAuthEmail({
        clientEmail: client.email,
        clientName: client.name,
        inviteToken: token,
      });
    } catch (emailErr) {
      console.error('LinkedIn auth email failed:', emailErr.message);
      return res.json({ ok: true, token, emailWarning: emailErr.message });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /clients/:id/notes
router.get('/:id/notes', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT section, content, updated_at FROM client_notes WHERE client_id = $1',
      [req.params.id]
    );
    const notes = {};
    for (const row of rows) notes[row.section] = { content: row.content, updated_at: row.updated_at };
    res.json(notes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /clients/:id/notes/:section
router.put('/:id/notes/:section', async (req, res) => {
  const VALID = ['bio', 'talking_points', 'approved_examples', 'discovery_notes', 'ideas', 'reference_links'];
  const { section } = req.params;
  if (!VALID.includes(section)) return res.status(400).json({ error: 'Invalid section' });
  const { content = '' } = req.body;
  try {
    await pool.query(
      `INSERT INTO client_notes (client_id, section, content, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (client_id, section)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [req.params.id, section, content]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /clients/:id/transcripts
router.get('/:id/transcripts', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM client_transcripts WHERE client_id = $1 ORDER BY session_date DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /clients/:id/transcripts
router.post('/:id/transcripts', async (req, res) => {
  const { session_date, title, content } = req.body;
  if (!session_date || !content) return res.status(400).json({ error: 'Date and content required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO client_transcripts (client_id, session_date, title, content)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, session_date, title || null, content]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /clients/:id/transcripts/:tid
router.put('/:id/transcripts/:tid', async (req, res) => {
  const { session_date, title, content } = req.body;
  if (!session_date || !content) return res.status(400).json({ error: 'Date and content required' });
  try {
    const { rows } = await pool.query(
      `UPDATE client_transcripts SET session_date = $1, title = $2, content = $3, updated_at = NOW()
       WHERE id = $4 AND client_id = $5 RETURNING *`,
      [session_date, title || null, content, req.params.tid, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /clients/:id/transcripts/:tid
router.delete('/:id/transcripts/:tid', async (req, res) => {
  try {
    await pool.query('DELETE FROM client_transcripts WHERE id = $1 AND client_id = $2', [req.params.tid, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /clients/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
