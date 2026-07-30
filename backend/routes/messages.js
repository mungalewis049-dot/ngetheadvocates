const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { sendNotificationEmail } = require('../utils/mailer');

const router = express.Router();

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many submissions from this device. Please try again later.' }
});

// ---------- PUBLIC ----------
// POST /api/messages -> contact form submission
router.post('/', submitLimiter, async (req, res) => {
  const { full_name, email, phone, subject, message } = req.body || {};
  if (!full_name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required' });
  }

  db.prepare(
    `INSERT INTO messages (full_name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)`
  ).run(full_name, email, phone || '', subject || '', message);

  logActivity(`Message received from ${full_name}: "${subject || 'No subject'}"`);

  // Fire-and-forget email notification; never block the form response on it
  sendNotificationEmail({ full_name, email, phone, subject, message }).catch((err) => {
    console.error('Email notification failed:', err.message);
  });

  res.status(201).json({ success: true });
});

// ---------- ADMIN ----------
// GET /api/messages -> paginated, newest first. Supports ?page=&limit=
router.get('/', requireAuth, (req, res) => {
  let limit = parseInt(req.query.limit, 10);
  let page = parseInt(req.query.page, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 20;
  if (limit > 500) limit = 500;
  if (!Number.isFinite(page) || page <= 0) page = 1;
  const offset = (page - 1) * limit;

  const total = db.prepare(`SELECT COUNT(*) AS count FROM messages`).get().count;
  const messages = db.prepare(
    `SELECT * FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(limit, offset);

  res.json({
    messages,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  });
});

module.exports = router;
