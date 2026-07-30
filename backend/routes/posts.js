const express = require('express');
const sanitizeHtml = require('sanitize-html');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const router = express.Router();

const SANITIZE_OPTIONS = {
  allowedTags: [
    'p', 'br', 'strong', 'em', 'u', 'b', 'i', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'blockquote', 'a', 'img', 'span'
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt'],
    span: ['class']
  },
  allowedSchemes: ['http', 'https', 'data']
};

function sanitizeBody(body) {
  return sanitizeHtml(body, SANITIZE_OPTIONS);
}

function parsePagination(query, maxLimit = 100) {
  let limit = parseInt(query.limit, 10);
  let page = parseInt(query.page, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 20;
  if (limit > maxLimit) limit = maxLimit; // hard ceiling to prevent abuse
  if (!Number.isFinite(page) || page <= 0) page = 1;
  const offset = (page - 1) * limit;
  return { limit, page, offset };
}

// ---------- PUBLIC ----------
// GET /api/posts -> published posts only, for the live site
// Supports ?category=&page=&limit=
router.get('/', async (req, res, next) => {
  try {
    const { limit, page, offset } = parsePagination(req.query);
    const { category } = req.query;

    const where = category
      ? 'WHERE published = 1 AND category = ?'
      : 'WHERE published = 1';
    const params = category ? [category] : [];

    const totalRow = await db.get(`SELECT COUNT(*) AS count FROM posts ${where}`, params);
    const posts = await db.all(
      `SELECT * FROM posts ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      posts,
      pagination: { page, limit, total: totalRow.count, totalPages: Math.ceil(totalRow.count / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// ---------- ADMIN ----------
// GET /api/posts/admin -> all posts, published + drafts
// Supports ?category=&published=&page=&limit=
router.get('/admin', requireAuth, async (req, res, next) => {
  try {
    const { limit, page, offset } = parsePagination(req.query, 500);
    const { category, published } = req.query;

    const clauses = [];
    const params = [];
    if (category) { clauses.push('category = ?'); params.push(category); }
    if (published === '0' || published === '1') { clauses.push('published = ?'); params.push(Number(published)); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const totalRow = await db.get(`SELECT COUNT(*) AS count FROM posts ${where}`, params);
    const posts = await db.all(
      `SELECT * FROM posts ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      posts,
      pagination: { page, limit, total: totalRow.count, totalPages: Math.ceil(totalRow.count / limit) }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/posts -> create
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { title, category, image_url, body, published } = req.body || {};
    if (!title || !category || !body) {
      return res.status(400).json({ error: 'Title, category, and body are required' });
    }
    const cleanBody = sanitizeBody(body);
    const today = new Date().toISOString().slice(0, 10);
    const info = await db.run(
      `INSERT INTO posts (title, category, image_url, body, published, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, category, image_url || null, cleanBody, published ? 1 : 0, today]
    );

    await logActivity(`Post created: "${title}"`);
    const post = await db.get('SELECT * FROM posts WHERE id = ?', [info.lastInsertRowid]);
    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
});

// PUT /api/posts/:id -> update
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await db.get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Post not found' });

    const { title, category, image_url, body, published } = req.body || {};
    if (!title || !category || !body) {
      return res.status(400).json({ error: 'Title, category, and body are required' });
    }
    const cleanBody = sanitizeBody(body);
    const today = new Date().toISOString().slice(0, 10);
    await db.run(
      `UPDATE posts SET title=?, category=?, image_url=?, body=?, published=?, updated_at=? WHERE id=?`,
      [title, category, image_url || null, cleanBody, published ? 1 : 0, today, req.params.id]
    );

    await logActivity(`Post updated: "${title}"`);
    const post = await db.get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    res.json(post);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/posts/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await db.get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Post not found' });

    await db.run('DELETE FROM posts WHERE id = ?', [req.params.id]);
    await logActivity(`Post deleted: "${existing.title}"`);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
