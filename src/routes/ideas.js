const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

const VALID_STATUS = ['idea', 'in_progress', 'drafted'];

function withClient(id) {
  return pool.query(
    `SELECT i.*, c.name AS client_name
     FROM ideas i LEFT JOIN clients c ON c.id = i.client_id
     WHERE i.id = $1`,
    [id]
  );
}

// GET /ideas?client_id=X&status=Y
router.get('/', async (req, res) => {
  try {
    const { client_id, status } = req.query;
    const { rows } = await pool.query(
      `SELECT i.*, c.name AS client_name
       FROM ideas i LEFT JOIN clients c ON c.id = i.client_id
       WHERE ($1::int IS NULL OR i.client_id = $1)
         AND ($2::text IS NULL OR i.status = $2)
       ORDER BY i.created_at DESC`,
      [client_id ? parseInt(client_id) : null, status || null]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /ideas
router.post('/', async (req, res) => {
  const { client_id, title, notes, content_pillar, source } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO ideas (client_id, title, notes, content_pillar, source)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [client_id || null, title.trim(), notes || null, content_pillar || null, source || null]
    );
    const { rows: full } = await withClient(rows[0].id);
    res.status(201).json(full[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /ideas/:id
router.put('/:id', async (req, res) => {
  const { title, notes, content_pillar, source, status, client_id } = req.body;
  if (status && !VALID_STATUS.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    const sets = [];
    const vals = [];
    let n = 1;
    const add = (col, val) => { sets.push(`${col} = $${n++}`); vals.push(val); };
    if (title !== undefined) add('title', title.trim());
    if (notes !== undefined) add('notes', notes || null);
    if (content_pillar !== undefined) add('content_pillar', content_pillar || null);
    if (source !== undefined) add('source', source || null);
    if (status !== undefined) add('status', status);
    if (client_id !== undefined) add('client_id', client_id || null);
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    sets.push(`updated_at = NOW()`);
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE ideas SET ${sets.join(', ')} WHERE id = $${n} RETURNING id`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const { rows: full } = await withClient(rows[0].id);
    res.json(full[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /ideas/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ideas WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
