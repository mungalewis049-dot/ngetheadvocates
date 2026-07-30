const { createClient } = require('@libsql/client');

// Turso (libSQL) connection. Locally, if TURSO_DATABASE_URL is not set, this
// falls back to a local file so you can still develop without a Turso account.
const url = process.env.TURSO_DATABASE_URL || 'file:./data/ngethe.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

const client = createClient({ url, authToken });

async function init() {
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        image_url TEXT,
        body TEXT NOT NULL,
        published INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        subject TEXT,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        time TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    ],
    'write'
  );
}

// Thin helpers so route code reads close to the old better-sqlite3 style,
// just with await. All three take a SQL string and a flat array of params.

async function get(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return result.rows;
}

async function run(sql, params = []) {
  const result = await client.execute({ sql, args: params });
  return { lastInsertRowid: result.lastInsertRowid, changes: result.rowsAffected };
}

module.exports = { init, get, all, run, client };
