import bcrypt from 'bcrypt';
import { generateSixDigitCode } from '../utils/otp.js';
import { sendLoginVerificationCodeEmail } from '../utils/email.js';
import { computeDeviceFingerprint } from '../middleware/requireAuth.js';
import { query } from '../config/db.js';
import { ensureOwnerProfileRow } from '../services/ownerProfileService.js';
import { verifyPasswordScrypt } from '../utils/passwordHash.js';

const LEGACY_ALLOWED_USERNAME = 'omega';
const LEGACY_ALLOWED_EMAIL = 'ntivuguruzwaphilemon0@gmail.com';
// bcrypt hash of the allowed password "123456" (cost=12)
const LEGACY_ALLOWED_PASSWORD_HASH = '$2b$12$WBzCEdjjpoP7bnU8PWz7.uzMh3YE8J9hOOMVhKR6POvMdCJmQ7k9G';

async function getAuthConfig() {
  // Single-tenant: one owner/admin account.
  const userId = 1;

  try {
    await ensureOwnerProfileRow(userId);
  } catch {
    // If migrations aren't applied yet, keep legacy auth working.
    return {
      mode: 'legacy',
      userId,
      username: LEGACY_ALLOWED_USERNAME,
      email: LEGACY_ALLOWED_EMAIL,
      password_hash: null,
    };
  }

  const res = await query(
    'SELECT username, email, password_hash FROM owner_profile WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  const row = res.rows?.[0] ?? null;

  const hasOwnerPassword = Boolean(row?.password_hash);
  if (!hasOwnerPassword) {
    return {
      mode: 'legacy',
      userId,
      username: LEGACY_ALLOWED_USERNAME,
      email: LEGACY_ALLOWED_EMAIL,
      password_hash: null,
    };
  }

  const username = String(row?.username ?? '').trim() || LEGACY_ALLOWED_USERNAME;
  // Backward compatibility: if email isn't configured yet, keep legacy email working so OTP can still be delivered.
  const email = String(row?.email ?? '').trim() || LEGACY_ALLOWED_EMAIL;

  return {
    mode: 'owner_profile',
    userId,
    username,
    email,
    password_hash: String(row.password_hash),
  };
}

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
  const cfg = await getAuthConfig();

  if (session?.user?.role === 'admin' && (session?.user?.user_id === cfg.userId || !session?.user?.user_id)) {
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

  const providedUsername = String(username ?? '').trim();
  const expectedUsername = String(cfg.username ?? '').trim();
  const legacyAliasAllowed =
    cfg.mode === 'owner_profile' &&
    expectedUsername.toLowerCase() === 'owner' &&
    providedUsername === LEGACY_ALLOWED_USERNAME;

  if (providedUsername !== expectedUsername && !legacyAliasAllowed) {
    return { success: false, status: 401, error: 'Invalid username or password' };
  }

  if (cfg.mode === 'owner_profile') {
    const ok = verifyPasswordScrypt(String(password ?? ''), cfg.password_hash);
    if (!ok) {
      return { success: false, status: 401, error: 'Invalid username or password' };
    }
  } else {
    const ok = await bcrypt.compare(String(password ?? ''), LEGACY_ALLOWED_PASSWORD_HASH);
    if (!ok) {
      return { success: false, status: 401, error: 'Invalid username or password' };
    }
  }

  await ensureLoginOtpsTable();

  const code = generateSixDigitCode();

  // Invalidate old OTP(s) for resend support.
  await invalidateOtpsForEmail(cfg.email);

  const otpHash = await bcrypt.hash(code, 12);
  const expiresAt = new Date(Date.now() + OTP_EXPIRES_MS);
  await insertOtp({ email: cfg.email, otpHash, expiresAt });

  try {
    await sendLoginVerificationCodeEmail({
      to: cfg.email,
      code,
      expiresMinutes: OTP_EXPIRES_MINUTES,
    });
  } catch (err) {
    // If send fails, remove the just-created OTP row so a retry generates a fresh one.
    await deleteLatestOtpForEmail(cfg.email);
    throw err;
  }

  return { success: true, requiresOtp: true, requires_verification: true };
}

export async function verifyOtp({ email, otp }, { session, req }) {
  const cfg = await getAuthConfig();

  // Backward compatibility: allow missing email from the client.
  const provided = String(email ?? '').trim();
  if (provided && provided !== String(cfg.email ?? '')) {
    return { success: false, status: 400, error: 'Invalid or expired verification code' };
  }

  const raw = String(otp ?? '').trim();
  if (!/^\d{6}$/.test(raw)) {
    return { success: false, status: 400, error: 'Invalid or expired verification code' };
  }

  await ensureLoginOtpsTable();

  const { rows } = await query(
    'SELECT id, otp_hash, expires_at FROM login_otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
    [cfg.email]
  );

  const record = rows?.[0];
  if (!record) {
    return { success: false, status: 400, error: 'Invalid or expired verification code' };
  }

  const expiresAt = new Date(record.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
    await invalidateOtpsForEmail(cfg.email);
    return { success: false, status: 400, error: 'Invalid or expired verification code' };
  }

  const ok = await bcrypt.compare(raw, record.otp_hash);
  if (!ok) {
    return { success: false, status: 400, error: 'Invalid or expired verification code' };
  }

  // Single-use OTP: delete after successful verification.
  await invalidateOtpsForEmail(cfg.email);

  session.user = {
    user_id: cfg.userId,
    username: cfg.username,
    role: 'admin',
  };
  session.deviceFingerprint = computeDeviceFingerprint(req);

  // Best-effort audit.
  try {
    await query('UPDATE owner_profile SET last_login_at = NOW() WHERE user_id = $1', [cfg.userId]);
  } catch {
    // ignore
  }

  return { success: true, message: 'Login successful' };
}

export function me({ session, req }) {
  const user = session?.user;
  if (!user || user.role !== 'admin') {
    return { success: true, isAuthenticated: false };
  }

  const expected = session.deviceFingerprint;
  const actual = computeDeviceFingerprint(req);
  if (!expected || expected !== actual) {
    return { success: true, isAuthenticated: false };
  }

  // If user_id is present, enforce it. If not, keep backward compatibility for older sessions.
  if (user.user_id != null && Number(user.user_id) !== 1) {
    return { success: true, isAuthenticated: false };
  }

  return { success: true, isAuthenticated: true, user };
}

export async function logout({ session }) {
  if (!session) return;
  await new Promise((resolve) => session.destroy(() => resolve()));
}
