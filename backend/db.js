const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// On Render, DB_PATH points at the mounted persistent disk (see render.yaml)
// so the database survives redeploys. Locally it falls back to ./data/.
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'ngethe.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  image_url TEXT,
  body TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = db;
