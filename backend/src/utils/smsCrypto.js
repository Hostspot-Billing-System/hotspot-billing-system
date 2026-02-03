import crypto from 'node:crypto';

function getSecret() {
  // Prefer a dedicated secret, but fall back to other existing secrets so
  // we can encrypt without breaking existing deployments.
  const secret = String(
    process.env.SMS_ENCRYPTION_SECRET ??
      process.env.ROUTER_ENCRYPTION_SECRET ??
      process.env.PORTAL_CALLBACK_SECRET ??
      ''
  ).trim();

  if (!secret) {
    throw new Error(
      'Missing encryption secret. Set SMS_ENCRYPTION_SECRET (recommended) or ROUTER_ENCRYPTION_SECRET.'
    );
  }

  // Derive a stable 32-byte key.
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSmsSecret(plaintext) {
  const text = String(plaintext ?? '');
  if (!text) return null;

  const key = getSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Store as base64(iv).base64(tag).base64(ciphertext)
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptSmsSecret(payload) {
  const raw = String(payload ?? '').trim();
  if (!raw) return null;

  const parts = raw.split('.');
  if (parts.length !== 3) return null;

  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');

  const key = getSecret();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return plaintext;
}
