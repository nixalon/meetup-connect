import { verifyToken, isValidEmail } from '../lib/token.js';

// POST /api/send-cv  { email, token, turnstileToken, website }
// Emails the CV to the visitor. Guarded by: signed QR token, Cloudflare Turnstile,
// a honeypot field, strict email validation and a per-instance rate limit.

const MAX_CV_BYTES = 5 * 1024 * 1024;
let cachedCv = null;

// Best-effort limit; serverless instances don't share memory, so Turnstile is the main guard.
const recent = new Map();
function rateLimited(key, limit = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const hits = (recent.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > limit;
}

async function verifyTurnstile(responseToken, ip) {
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: responseToken });
  if (ip) body.set('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = await r.json();
  return data.success === true;
}

async function loadCv() {
  if (cachedCv) return cachedCv;
  const r = await fetch(process.env.CV_URL);
  if (!r.ok) throw new Error(`CV fetch failed: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_CV_BYTES || buf.subarray(0, 4).toString() !== '%PDF') {
    throw new Error('CV_URL did not return a PDF under 5 MB');
  }
  cachedCv = buf.toString('base64');
  return cachedCv;
}

async function sendEmail(payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Resend error ${r.status}: ${await r.text()}`);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!(req.headers['content-type'] || '').startsWith('application/json')) return res.status(415).end();

  const { email, token, turnstileToken, website } = req.body || {};
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();

  // Honeypot: real people never fill the hidden "website" field. Pretend success.
  if (website) return res.status(200).json({ ok: true });

  if (!verifyToken(process.env.TOKEN_SECRET, token)) {
    return res.status(403).json({ error: 'This link has expired. Please scan the QR code again.' });
  }
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  if (!isValidEmail(cleanEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (rateLimited(`ip:${ip}`) || rateLimited(`to:${cleanEmail.toLowerCase()}`, 2)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  if (typeof turnstileToken !== 'string' || !(await verifyTurnstile(turnstileToken, ip))) {
    return res.status(403).json({ error: 'Bot check failed. Please refresh and try again.' });
  }

  const name = process.env.OWNER_NAME || 'Alexandra';
  try {
    const cv = await loadCv();
    await sendEmail({
      from: process.env.MAIL_FROM,
      to: [cleanEmail],
      reply_to: process.env.MAIL_REPLY_TO,
      subject: `${name}'s CV`,
      text:
        `Hi,\n\nThanks for connecting at the meetup! My CV is attached.\n` +
        `Just reply to this email if you'd like to talk.\n\nBest regards,\n${name}\n`,
      attachments: [{ filename: process.env.CV_FILENAME || 'CV.pdf', content: cv }],
    });

    if (process.env.NOTIFY_EMAIL) {
      // Tell yourself who asked, so you can follow up.
      await sendEmail({
        from: process.env.MAIL_FROM,
        to: [process.env.NOTIFY_EMAIL],
        subject: `CV requested by ${cleanEmail}`,
        text: `${cleanEmail} requested your CV at ${new Date().toISOString()}.`,
      }).catch((e) => console.error('notify failed:', e.message));
    }
  } catch (e) {
    console.error('send-cv failed:', e.message);
    return res.status(502).json({ error: 'Could not send the email right now. Please try again.' });
  }

  return res.status(200).json({ ok: true });
}
