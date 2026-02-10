import crypto from 'node:crypto';
import { loginStep1, logout, me, verifyOtp } from './auth.service.js';
import { ensureOwnerProfileRow } from '../services/ownerProfileService.js';
import { query } from '../config/db.js';
import { hashPasswordScrypt } from '../utils/passwordHash.js';
import { sendPasswordResetEmail } from '../utils/email.js';

const RESET_EXPIRES_MINUTES = 15;
const RESET_EXPIRES_MS = RESET_EXPIRES_MINUTES * 60 * 1000;

// Backward-compatible single admin identity (matches legacy auth defaults).
const LEGACY_ADMIN_EMAIL = 'ntivuguruzwaphilemon0@gmail.com';
const LEGACY_ADMIN_USERNAME = 'omega';

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function getFrontendBaseUrl(req) {
  const env = process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL;
  if (env && String(env).trim()) return String(env).trim().replace(/\/$/, '');

  const origin = req.get?.('origin');
  if (origin && String(origin).trim()) return String(origin).trim().replace(/\/$/, '');

  return 'http://localhost:5173';
}

async function ensurePasswordResetColumns() {
  // Make the feature work even if migrations haven't been applied yet.
  // This is safe because it is idempotent.
  await query(
    `
    ALTER TABLE owner_profile
      ADD COLUMN IF NOT EXISTS reset_token TEXT NULL,
      ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ NULL;
    `
  );
}

async function invalidateAdminSessions(sessionStore) {
  const store = sessionStore;
  if (!store || typeof store.all !== 'function' || typeof store.destroy !== 'function') {
    return;
  }

  await new Promise((resolve) => {
    store.all((err, sessions) => {
      if (err || !sessions) return resolve();

      const entries = Object.entries(sessions);
      let pending = entries.length;
      if (pending === 0) return resolve();

      for (const [sid, sess] of entries) {
        const user = sess?.user;
        const isAdmin = user?.role === 'admin' && (user?.user_id == null || Number(user.user_id) === 1);
        if (!isAdmin) {
          pending -= 1;
          if (pending === 0) resolve();
          continue;
        }

        store.destroy(sid, () => {
          pending -= 1;
          if (pending === 0) resolve();
        });
      }
    });
  });
}

export async function postLogin(req, res) {
  try {
    const result = await loginStep1(req.body ?? {}, { session: req.session, req });
    if (!result.success) {
      return res.status(result.status ?? 400).json({ success: false, error: result.error });
    }
    return res.json({
      success: true,
      requiresOtp: result.requiresOtp,
      requires_verification: result.requires_verification,
    });
  } catch (err) {
    const msg = err?.message ?? 'Failed to send verification code';
    return res.status(500).json({ success: false, error: msg });
  }
}

export async function postResendOtp(req, res) {
  // Same as login step 1: validate credentials, invalidate old OTP, send a new OTP.
  return postLogin(req, res);
}

export async function postVerify(req, res) {
  const body = req.body ?? {};
  // New contract: { email, otp }
  // Backward compatibility: { username, verification_code }
  const email = body.email;
  const otp = body.otp ?? body.verification_code;
  const result = await verifyOtp({ email, otp }, { session: req.session, req });
  if (!result.success) {
    return res.status(result.status ?? 400).json({ success: false, error: result.error });
  }

  return res.json({ success: true, message: result.message });
}

export function getMe(req, res) {
  const result = me({ session: req.session, req });
  if (!result.isAuthenticated) {
    return res.status(401).json({
      success: false,
      isAuthenticated: false,
      error: 'Not authenticated',
    });
  }
  return res.json(result);
}

export async function postLogout(req, res) {
  await logout({ session: req.session });
  res.clearCookie('omega.sid');
  return res.json({ success: true });
}

export async function postForgotPassword(req, res) {
  const email = String(req.body?.email ?? '').trim();

  // Always return success to avoid email enumeration.
  const okBody = {
    success: true,
    message: 'If an account exists for that email, a reset link has been sent.',
  };

  try {
    await ensureOwnerProfileRow(1);
    await ensurePasswordResetColumns();
    const { rows } = await query('SELECT username, email FROM owner_profile WHERE user_id = 1 LIMIT 1');
    const row = rows?.[0] ?? null;
    const storedEmail = String(row?.email ?? '').trim() || LEGACY_ADMIN_EMAIL;
    const username = String(row?.username ?? '').trim() || LEGACY_ADMIN_USERNAME;

    if (!email || !storedEmail || email.toLowerCase() !== storedEmail.toLowerCase()) {
      return res.status(200).json(okBody);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + RESET_EXPIRES_MS);

    await query(
      'UPDATE owner_profile SET reset_token = $2, reset_token_expires = $3 WHERE user_id = $1',
      [1, tokenHash, expiresAt]
    );

    const resetUrl = `${getFrontendBaseUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;
    await sendPasswordResetEmail({
      to: storedEmail,
      username,
      resetUrl,
      expiresMinutes: RESET_EXPIRES_MINUTES,
    });

    return res.status(200).json(okBody);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[forgot-password] failed:', err?.message ?? err);
    // Never leak internal details here.
    return res.status(200).json(okBody);
  }
}

export async function getResetPassword(req, res) {
  const token = String(req.query?.token ?? '').trim();
  if (!token) return res.status(200).json({ success: true, valid: false });

  try {
    await ensureOwnerProfileRow(1);
    await ensurePasswordResetColumns();
    const tokenHash = sha256Hex(token);
    const { rows } = await query(
      'SELECT reset_token_expires FROM owner_profile WHERE user_id = 1 AND reset_token = $1 LIMIT 1',
      [tokenHash]
    );
    const row = rows?.[0] ?? null;
    if (!row?.reset_token_expires) return res.status(200).json({ success: true, valid: false });

    const expires = new Date(row.reset_token_expires);
    const valid = Number.isFinite(expires.getTime()) && Date.now() <= expires.getTime();
    return res.status(200).json({ success: true, valid });
  } catch {
    return res.status(200).json({ success: true, valid: false });
  }
}

export async function postResetPassword(req, res) {
  const token = String(req.body?.token ?? '').trim();
  const new_password = String(req.body?.new_password ?? '');
  const confirm_password = String(req.body?.confirm_password ?? req.body?.confirm_new_password ?? '');

  if (!token) return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
  if (new_password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  if (new_password !== confirm_password) return res.status(400).json({ success: false, error: 'Passwords do not match' });

  try {
    await ensureOwnerProfileRow(1);
    await ensurePasswordResetColumns();
    const tokenHash = sha256Hex(token);
    const { rows } = await query(
      'SELECT reset_token_expires FROM owner_profile WHERE user_id = 1 AND reset_token = $1 LIMIT 1',
      [tokenHash]
    );
    const row = rows?.[0] ?? null;
    if (!row?.reset_token_expires) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
    }

    const expires = new Date(row.reset_token_expires);
    const valid = Number.isFinite(expires.getTime()) && Date.now() <= expires.getTime();
    if (!valid) {
      await query('UPDATE owner_profile SET reset_token = NULL, reset_token_expires = NULL WHERE user_id = 1');
      return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
    }

    const hashed = hashPasswordScrypt(new_password);
    await query(
      'UPDATE owner_profile SET password_hash = $2, reset_token = NULL, reset_token_expires = NULL WHERE user_id = $1',
      [1, hashed]
    );

    // Mandatory: invalidate all active sessions after password reset.
    await invalidateAdminSessions(req.sessionStore);

    return res.status(200).json({ success: true });
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
  }
}
