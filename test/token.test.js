import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToken, verifyToken, safeEqual, isValidEmail } from '../lib/token.js';

const SECRET = 'x'.repeat(40);

test('valid token verifies', () => {
  assert.ok(verifyToken(SECRET, createToken(SECRET, 60)));
});

test('expired token is rejected', () => {
  const t = createToken(SECRET, 60, Date.now() - 120_000);
  assert.equal(verifyToken(SECRET, t), false);
});

test('tampered expiry or wrong secret is rejected', () => {
  const t = createToken(SECRET, 60);
  const [exp, sig] = t.split('.');
  assert.equal(verifyToken(SECRET, `${Number(exp) + 99999}.${sig}`), false);
  assert.equal(verifyToken('y'.repeat(40), t), false);
  assert.equal(verifyToken(SECRET, 'garbage'), false);
  assert.equal(verifyToken(SECRET, undefined), false);
});

test('short secret refuses to sign', () => {
  assert.throws(() => createToken('short', 60));
});

test('safeEqual', () => {
  assert.ok(safeEqual('abc', 'abc'));
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('', ''), false);
  assert.equal(safeEqual('abc', undefined), false);
});

test('email validation', () => {
  assert.ok(isValidEmail('jane.doe+jobs@company.co.uk'));
  for (const bad of ['', 'a@b', 'a b@c.com', 'a@b.com,c@d.com', 'a@b.com\r\nBcc: x@y.com', 'Jane <a@b.com>', 'a..b@c.com']) {
    assert.equal(isValidEmail(bad), false, bad);
  }
});
