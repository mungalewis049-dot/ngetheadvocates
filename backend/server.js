require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const postsRoutes = require('./routes/posts');
const messagesRoutes = require('./routes/messages');
const chatRoutes = require('./routes/chat');
const { requireAuth } = require('./middleware/auth');
const db = require('./db');

const REQUIRED_ENV = ['JWT_SECRET', 'ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required .env variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill these in before starting the server.');
  process.exit(1);
}

const app = express();

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '8mb' })); // generous limit to allow base64 image uploads

// ---------- API routes ----------
app.use('/api/auth', authRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/chat', chatRoutes);

// Dashboard stats (admin only)
app.get('/api/dashboard', requireAuth, async (req, res, next) => {
  try {
    const totalsRow = await db.get(
      `SELECT COUNT(*) AS totalPosts, SUM(published) AS published FROM posts`
    );
    const totalPosts = totalsRow.totalPosts || 0;
    const published = totalsRow.published || 0;

    const totalMessagesRow = await db.get(`SELECT COUNT(*) AS count FROM messages`);

    const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const messagesThisWeekRow = await db.get(
      `SELECT COUNT(*) AS count FROM messages WHERE created_at >= ?`,
      [weekAgoIso]
    );

    const byCategoryRows = await db.all(
      `SELECT category, COUNT(*) AS count FROM posts GROUP BY category`
    );
    const byCategory = {};
    byCategoryRows.forEach((row) => { byCategory[row.category] = row.count; });

    const activity = await db.all('SELECT * FROM activity ORDER BY id DESC LIMIT 30');

    res.json({
      totalPosts,
      published,
      drafts: totalPosts - published,
      totalMessages: totalMessagesRow.count,
      messagesThisWeek: messagesThisWeekRow.count,
      byCategory,
      activity
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ---------- Serve the frontend ----------
// Place index.html, admin.html, and any assets in /public
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- Error handler ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
db.init()
  .then(() => {
    app.listen(PORT, () => console.log(`Ngethe & Company backend running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
