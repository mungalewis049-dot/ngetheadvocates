// Usage: node hash-password.js "yourNewPassword"
// Paste the output into ADMIN_PASSWORD_HASH in your .env file.
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node hash-password.js "yourPassword"');
  process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => {
  console.log('\nAdd this line to your .env file:\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
});
