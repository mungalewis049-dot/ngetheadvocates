// Optional: sends an email to the firm whenever a contact form is submitted.
// If SMTP env vars aren't set, this silently no-ops so the backend still
// works without email configured.

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

function getTransport() {
  if (!nodemailer) return null;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendNotificationEmail({ full_name, email, phone, subject, message }) {
  const transport = getTransport();
  if (!transport || !process.env.NOTIFY_EMAIL_TO) return;

  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_EMAIL_TO,
    replyTo: email,
    subject: `New website enquiry: ${subject || 'No subject'}`,
    text: `From: ${full_name} <${email}>\nPhone: ${phone || 'N/A'}\n\n${message}`
  });
}

module.exports = { sendNotificationEmail };
