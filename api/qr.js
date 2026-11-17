import QRCode from 'qrcode';
import { createToken, safeEqual } from '../lib/token.js';

// GET /api/qr  (Authorization: Bearer <QR_ACCESS_KEY>)
// Returns an SVG QR code pointing at SITE_URL/?t=<signed, expiring token>.
// Only you (holding QR_ACCESS_KEY) can mint fresh codes.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).end();

  const auth = req.headers.authorization || '';
  const key = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!safeEqual(key, process.env.QR_ACCESS_KEY)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const ttlMinutes = Number(process.env.TOKEN_TTL_MINUTES) || 120;
  const token = createToken(process.env.TOKEN_SECRET, ttlMinutes * 60);
  const url = new URL(process.env.SITE_URL);
  url.searchParams.set('t', token);

  const svg = await QRCode.toString(url.toString(), {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('X-Link-Expires-In', String(ttlMinutes * 60));
  return res.status(200).send(svg);
}
