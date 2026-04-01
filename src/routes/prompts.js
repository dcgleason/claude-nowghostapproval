const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

const VALID_CATEGORIES = ['cold-outreach', 'follow-up', 'post-draft', 'research', 'response', 'general'];

// GET /api/prompts
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM prompts ORDER BY category, updated_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/prompts/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM prompts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/prompts
router.post('/', async (req, res) => {
  const { title, category = 'general', content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'title and content required' });
  const cat = VALID_CATEGORIES.includes(category) ? category : 'general';
  try {
    const { rows } = await pool.query(
      'INSERT INTO prompts (title, category, content) VALUES ($1, $2, $3) RETURNING *',
      [title, cat, content]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/prompts/:id
router.put('/:id', async (req, res) => {
  const { title, category, content } = req.body;
  const cat = category && VALID_CATEGORIES.includes(category) ? category : undefined;
  try {
    const { rows } = await pool.query(
      `UPDATE prompts
       SET title = COALESCE($1, title),
           category = COALESCE($2, category),
           content = COALESCE($3, content),
           updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [title || null, cat || null, content || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/prompts/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM prompts WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
