const db = require('../db');

function logActivity(text) {
  db.prepare(`INSERT INTO activity (text) VALUES (?)`).run(text);
  db.prepare(`
    DELETE FROM activity WHERE id NOT IN (
      SELECT id FROM activity ORDER BY id DESC LIMIT 30
    )
  `).run();
}

module.exports = { logActivity };
