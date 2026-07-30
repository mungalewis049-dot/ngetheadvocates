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
router.post('/', submitLimiter, async (req, res, next) => {
  try {
    const { full_name, email, phone, subject, message } = req.body || {};
    if (!full_name || !email || !message) {
      return res.status(400).json({ error: 'Name, email, and message are required' });
    }

    await db.run(
      `INSERT INTO messages (full_name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)`,
      [full_name, email, phone || '', subject || '', message]
    );

    await logActivity(`Message received from ${full_name}: "${subject || 'No subject'}"`);

    // Fire-and-forget email notification; never block the form response on it
    sendNotificationEmail({ full_name, email, phone, subject, message }).catch((err) => {
      console.error('Email notification failed:', err.message);
    });

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------- ADMIN ----------
// GET /api/messages -> paginated, newest first. Supports ?page=&limit=
router.get('/', requireAuth, async (req, res, next) => {
  try {
    let limit = parseInt(req.query.limit, 10);
    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 20;
    if (limit > 500) limit = 500;
    if (!Number.isFinite(page) || page <= 0) page = 1;
    const offset = (page - 1) * limit;

    const totalRow = await db.get(`SELECT COUNT(*) AS count FROM messages`);
    const messages = await db.all(
      `SELECT * FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({
      messages,
      pagination: { page, limit, total: totalRow.count, totalPages: Math.ceil(totalRow.count / limit) }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
