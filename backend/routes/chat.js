const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// ---------- Rate limiting ----------
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many messages. Please wait a few minutes and try again.' }
});

// ---------- In-memory conversation history ----------
// Keyed by sessionId (sent from the frontend, e.g. a random ID stored in localStorage).
// This is fine for a single-instance Render deployment; it resets on redeploy/restart.
const MAX_HISTORY_MESSAGES = 12; // 6 user/assistant turns
const MAX_SESSIONS = 500;
const sessions = new Map(); // sessionId -> { messages: [], lastUsed: timestamp }

function getSession(sessionId) {
  let session = sessions.get(sessionId);
  if (!session) {
    // Basic cap so this can't grow unbounded in memory
    if (sessions.size >= MAX_SESSIONS) {
      const oldestKey = [...sessions.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0][0];
      sessions.delete(oldestKey);
    }
    session = { messages: [], lastUsed: Date.now() };
    sessions.set(sessionId, session);
  }
  return session;
}

function pushToHistory(session, role, content) {
  session.messages.push({ role, content });
  if (session.messages.length > MAX_HISTORY_MESSAGES) {
    session.messages = session.messages.slice(-MAX_HISTORY_MESSAGES);
  }
  session.lastUsed = Date.now();
}

// ---------- Firm-specific system prompt ----------
const SYSTEM_PROMPT = `You are the virtual assistant for Ngethe & Company Advocates, a law firm based in Kenya.
Your role is to help website visitors with general information about the firm — its practice areas, team,
office location and contact details, and how to get in touch or book a consultation.

Guidelines:
- Be warm, professional, and concise (2-4 sentences per reply unless more detail is clearly needed).
- You can discuss the firm's practice areas in general terms (e.g. corporate law, conveyancing/real estate,
  litigation, family law, employment law) but do NOT provide specific legal advice or opinions on the visitor's
  personal legal situation. For anything specific to their case, direct them to book a consultation with the firm.
- If asked something you don't know about the firm, be honest and suggest they contact the office directly or
  use the contact form on the site.
- Do not make up case results, fees, or guarantees about legal outcomes.
- Encourage visitors to reach out via the contact form or phone for anything requiring a real conversation
  with an advocate.`;

// ---------- Rule-based fallback (used if the Anthropic API is unavailable or unconfigured) ----------
function fallbackReply(message) {
  const text = (message || '').toLowerCase();

  if (/(contact|reach|phone|email|call|office)/.test(text)) {
    return "You can reach Ngethe & Company Advocates through the contact form on this site, and our team will get back to you promptly. You're also welcome to call the office during business hours.";
  }
  if (/(practice|service|area|specializ|specialis|expertise)/.test(text)) {
    return 'Ngethe & Company Advocates handles a range of practice areas including corporate law, conveyancing/real estate, litigation, family law, and employment law. Take a look at our Services section for more detail, or reach out and we can point you to the right advocate.';
  }
  if (/(team|lawyer|advocate|staff|partner)/.test(text)) {
    return "You can meet our team in the Team section of this site, which lists our advocates and their areas of focus. If you'd like to work with someone specific, mention it in the contact form.";
  }
  if (/(consult|appointment|book|meeting)/.test(text)) {
    return "To book a consultation, please use the contact form with a bit of detail about your matter, and our team will follow up to schedule a time.";
  }
  if (/(hi|hello|hey|good morning|good afternoon)/.test(text)) {
    return "Hello! I'm the virtual assistant for Ngethe & Company Advocates. I can help with general questions about our practice areas, team, or how to get in touch. How can I help you today?";
  }

  return "Thanks for reaching out. I can help with general questions about Ngethe & Company Advocates — our practice areas, team, or contact details. For anything specific to your legal matter, please use the contact form so an advocate can follow up with you directly.";
}

// ---------- POST /api/chat ----------
router.post('/', chatLimiter, async (req, res) => {
  const { message, sessionId } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: 'Message is too long' });
  }

  const sid = typeof sessionId === 'string' && sessionId ? sessionId : 'anonymous';
  const session = getSession(sid);

  // No API key configured -> use rule-based fallback directly
  if (!process.env.ANTHROPIC_API_KEY) {
    const reply = fallbackReply(message);
    pushToHistory(session, 'user', message);
    pushToHistory(session, 'assistant', reply);
    return res.json({ reply, mode: 'fallback' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [...session.messages, { role: 'user', content: message }]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API responded with ${response.status}`);
    }

    const data = await response.json();
    const reply = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim() || fallbackReply(message);

    pushToHistory(session, 'user', message);
    pushToHistory(session, 'assistant', reply);

    res.json({ reply, mode: 'ai' });
  } catch (err) {
    console.error('Chatbot API error:', err.message);
    const reply = fallbackReply(message);
    pushToHistory(session, 'user', message);
    pushToHistory(session, 'assistant', reply);
    res.json({ reply, mode: 'fallback' });
  }
});

module.exports = router;
