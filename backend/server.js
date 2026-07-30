// Local development entrypoint. On Vercel, api/index.js is used instead —
// this file is only for running `node server.js` on your own machine.
const path = require('path');
const express = require('express');
const app = require('./app');

// Serve the frontend locally (Vercel serves /public natively instead).
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ngethe & Company backend running on port ${PORT}`));
