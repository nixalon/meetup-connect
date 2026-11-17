import crypto from 'node:crypto';

// Short-lived, signed tokens embedded in the QR link.
// Format: <expiryUnixSeconds>.<hmac>  (hmac truncated to 132 bits to keep the QR small)

const SIG_LEN = 22; // 22 base64url chars = 132 bits

function sign(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url').slice(0, SIG_LEN);
}

export function createToken(secret, ttlSeconds, now = Date.now()) {
  if (!secret || secret.length < 32) throw new Error('TOKEN_SECRET must be at least 32 characters');
  const exp = String(Math.floor(now / 1000) + ttlSeconds);
  return `${exp}.${sign(secret, exp)}`;
}

export function verifyToken(secret, token, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 64) return false;
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!match) return false;
  const [, exp, sig] = match;
  const expected = Buffer.from(sign(secret, exp));
  const actual = Buffer.from(sig);
  if (!crypto.timingSafeEqual(expected, actual)) return false;
  return Number(exp) * 1000 >= now;
}

// Constant-time comparison for secrets of possibly different length.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Deliberately strict: one plain address, no display names, commas, whitespace or CR/LF.
export function isValidEmail(email) {
  return (
    typeof email === 'string' &&
    email.length <= 254 &&
    /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}$/.test(email) &&
    !email.includes('..')
  );
}
