const db = require('../db');

async function logActivity(text) {
  await db.run(`INSERT INTO activity (text) VALUES (?)`, [text]);
  await db.run(`
    DELETE FROM activity WHERE id NOT IN (
      SELECT id FROM activity ORDER BY id DESC LIMIT 30
    )
  `);
}

module.exports = { logActivity };
