import crypto from 'crypto';

function requireSecret() {
  const secret = process.env.ROUTER_ENCRYPTION_SECRET || process.env.MIKROTIK_ROUTERS_ENCRYPTION_SECRET;
  if (!secret || String(secret).trim() === '') {
    const err = new Error('Missing ROUTER_ENCRYPTION_SECRET');
    err.code = 'MISSING_SECRET';
    throw err;
  }
  return String(secret);
}

function deriveKey(secret) {
  // Stable salt to allow re-derivation.
  return crypto.scryptSync(secret, 'mikrotik_routers_v1', 32);
}

export function encryptRouterPassword(plaintext) {
  const secret = requireSecret();
  const key = deriveKey(secret);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext ?? ''), 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // Format: iv.tag.ciphertext (base64)
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}
