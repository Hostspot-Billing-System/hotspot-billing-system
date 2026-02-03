import crypto from 'node:crypto';

function b64urlEncode(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64urlDecode(str) {
  const s = String(str ?? '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64');
}

export function hashPasswordScrypt(plaintext) {
  const pwd = String(plaintext ?? '');
  if (pwd.length < 6) throw new Error('Password must be at least 6 characters');

  const salt = crypto.randomBytes(16);
  const N = 16384;
  const r = 8;
  const p = 1;
  const keylen = 64;

  const derived = crypto.scryptSync(pwd, salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${b64urlEncode(salt)}$${b64urlEncode(derived)}`;
}

export function verifyPasswordScrypt(plaintext, stored) {
  const pwd = String(plaintext ?? '');
  const raw = String(stored ?? '');
  if (!raw) return false;

  const parts = raw.split('$');
  if (parts.length !== 7) return false;
  const [algo, Nraw, rraw, praw, saltB64, hashB64] = parts.slice(1);
  if (algo !== 'scrypt') return false;

  const N = Number(Nraw);
  const r = Number(rraw);
  const p = Number(praw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = b64urlDecode(saltB64);
  const expected = b64urlDecode(hashB64);

  const derived = crypto.scryptSync(pwd, salt, expected.length, { N, r, p });
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}
