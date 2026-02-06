import bcrypt from 'bcrypt';
import { generateSixDigitCode } from '../utils/otp.js';
import { sendLoginVerificationCodeEmail } from '../utils/email.js';
import { computeDeviceFingerprint } from '../middleware/requireAuth.js';
import { query } from '../config/db.js';

const ALLOWED_USERNAME = 'omega';
const ALLOWED_EMAIL = 'ntivuguruzwaphilemon0@gmail.com';
// bcrypt hash of the allowed password "123456" (cost=12)
const ALLOWED_PASSWORD_HASH = '$2b$12$WBzCEdjjpoP7bnU8PWz7.uzMh3YE8J9hOOMVhKR6POvMdCJmQ7k9G';

const OTP_EXPIRES_MINUTES = 10;
const OTP_EXPIRES_MS = OTP_EXPIRES_MINUTES * 60 * 1000;

async function ensureLoginOtpsTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS login_otps (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );`
  );
}

async function invalidateOtpsForEmail(email) {
  await query('DELETE FROM login_otps WHERE email = $1', [email]);
}

async function insertOtp({ email, otpHash, expiresAt }) {
  await query(
    'INSERT INTO login_otps (email, otp_hash, expires_at) VALUES ($1, $2, $3)',
    [email, otpHash, expiresAt]
  );
}

async function deleteLatestOtpForEmail(email) {
  await query(
    `DELETE FROM login_otps
     WHERE id = (
       SELECT id FROM login_otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1
     )`,
    [email]
  );
}

export async function loginStep1({ username, password }, { session, req }) {
  if (session?.user?.username === ALLOWED_USERNAME && session?.user?.role === 'admin') {
    const expected = session.deviceFingerprint;
    const actual = computeDeviceFingerprint(req);
    if (expected && expected === actual) {
      return { success: true, requiresOtp: false, requires_verification: false };
    }

    // Session exists but doesn't match device fingerprint; treat as unauthenticated.
    try {
      await new Promise((resolve) => session.destroy(() => resolve()));
    } catch {
      // ignore
    }
  }

  if (username !== ALLOWED_USERNAME) {
    return { success: false, status: 401, error: 'Invalid username or password' };
  }

  const ok = await bcrypt.compare(String(password ?? ''), ALLOWED_PASSWORD_HASH);
  if (!ok) {
    return { success: false, status: 401, error: 'Invalid username or password' };
  }

  await ensureLoginOtpsTable();

  const code = generateSixDigitCode();

  // Invalidate old OTP(s) for resend support.
  await invalidateOtpsForEmail(ALLOWED_EMAIL);

  const otpHash = await bcrypt.hash(code, 12);
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MS);
  await insertOtp({ email: ALLOWED_EMAIL, otpHash, expiresAt });

  try {
    await sendLoginVerificationCodeEmail({
      to: ALLOWED_EMAIL,
      code,
      expiresMinutes: OTP_EXPIRES_MINUTES,
    });
  } catch (err) {
    // If send fails, remove the just-created OTP row so a retry generates a fresh one.
    await deleteLatestOtpForEmail(ALLOWED_EMAIL);
    throw err;
  }

  return { success: true, requiresOtp: true, requires_verification: true };
}

export async function verifyOtp({ email, otp }, { session, req }) {
  if (email !== ALLOWED_EMAIL) {
    return { success: false, status: 400, error: 'Invalid or expired verification code' };
  }

  const raw = String(otp ?? '').trim();
  if (!/^\d{6}$/.test(raw)) {
    return { success: false, status: 400, error: 'Invalid or expired verification code' };
  }

  await ensureLoginOtpsTable();

  const { rows } = await query(
    'SELECT id, otp_hash, expires_at FROM login_otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
    [email]
  );

  const record = rows?.[0];
  if (!record) {
    return { success: false, status: 400, error: 'Invalid or expired verification code' };
  }

  const expiresAt = new Date(record.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
    await invalidateOtpsForEmail(email);
    return { success: false, status: 400, error: 'Invalid or expired verification code' };
  }

  const ok = await bcrypt.compare(raw, record.otp_hash);
  if (!ok) {
    return { success: false, status: 400, error: 'Invalid or expired verification code' };
  }

  // Single-use OTP: delete after successful verification.
  await invalidateOtpsForEmail(email);

  session.user = {
    username: ALLOWED_USERNAME,
    role: 'admin',
  };
  session.deviceFingerprint = computeDeviceFingerprint(req);

  return { success: true, message: 'Login successful' };
}

export function me({ session, req }) {
  if (!session?.user || session.user.username !== ALLOWED_USERNAME || session.user.role !== 'admin') {
    return { success: true, isAuthenticated: false };
  }

  const expected = session.deviceFingerprint;
  const actual = computeDeviceFingerprint(req);
  if (!expected || expected !== actual) {
    return { success: true, isAuthenticated: false };
  }

  return { success: true, isAuthenticated: true, user: session.user };
}

export async function logout({ session }) {
  if (!session) return;
  await new Promise((resolve) => session.destroy(() => resolve()));
}
