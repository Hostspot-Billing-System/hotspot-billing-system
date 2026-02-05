import { query } from '../config/db.js';
import { getRequestUserId } from './smsSettingsService.js';
import { hashPasswordScrypt, verifyPasswordScrypt } from '../utils/passwordHash.js';

async function hasTable(table) {
  try {
    const res = await query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
      LIMIT 1
      `,
      [String(table)]
    );
    return Boolean(res.rows?.[0]);
  } catch {
    return false;
  }
}

function normalizeText(value, { allowEmpty = true } = {}) {
  const s = String(value ?? '').trim();
  if (!s && !allowEmpty) return null;
  return s;
}

function normalizeEmail(value) {
  const s = normalizeText(value);
  if (!s) return '';
  if (s.length > 254) throw new Error('Email is too long');
  return s;
}

function normalizePhone(value) {
  const s = normalizeText(value);
  if (!s) return '';
  if (s.length > 32) throw new Error('Phone number is too long');
  return s;
}

export function getMyProfileUserId(req) {
  return getRequestUserId(req);
}

export async function ensureOwnerProfileRow(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('Invalid user_id');

  const ok = await hasTable('owner_profile');
  if (!ok) throw new Error('owner_profile table is missing. Apply migrations first.');

  const existing = await query('SELECT user_id FROM owner_profile WHERE user_id = $1 LIMIT 1', [uid]);
  if (existing.rows?.[0]) return;

  await query(
    `
    INSERT INTO owner_profile (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [uid]
  );
}

export async function getOwnerProfileByUserId(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return null;

  const ok = await hasTable('owner_profile');
  if (!ok) return null;

  await ensureOwnerProfileRow(uid);

  const res = await query(
    `
    SELECT
      user_id,
      username,
      email,
      phone_number,
      business_name,
      business_address,
      account_status,
      account_expires_at,
      commission_rate,
      member_since,
      last_login_at,
      created_at,
      updated_at
    FROM owner_profile
    WHERE user_id = $1
    LIMIT 1
    `,
    [uid]
  );

  return res.rows?.[0] ?? null;
}

export async function updateOwnerProfileByUserId(userId, payload = {}) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('Invalid user_id');

  await ensureOwnerProfileRow(uid);

  // Username is display-only in the current UI; keep existing if not provided.
  const existing = await query('SELECT username FROM owner_profile WHERE user_id = $1 LIMIT 1', [uid]);
  const currentUsername = String(existing.rows?.[0]?.username ?? 'Owner');

  const username = payload?.username == null || String(payload.username).trim() === ''
    ? currentUsername
    : normalizeText(payload?.username);

  if (!username) throw new Error('Username is required');
  if (username.length > 64) throw new Error('Username is too long');

  const email = normalizeEmail(payload?.email);
  const phone_number = normalizePhone(payload?.phone_number);

  const business_name = normalizeText(payload?.business_name);
  const business_address = normalizeText(payload?.business_address);

  const res = await query(
    `
    UPDATE owner_profile
    SET
      username = $2,
      email = $3,
      phone_number = $4,
      business_name = $5,
      business_address = $6
    WHERE user_id = $1
    RETURNING
      user_id,
      username,
      email,
      phone_number,
      business_name,
      business_address,
      account_status,
      account_expires_at,
      commission_rate,
      member_since,
      last_login_at,
      created_at,
      updated_at
    `,
    [uid, username, email, phone_number, business_name, business_address]
  );

  return res.rows?.[0] ?? null;
}

export async function changeOwnerPasswordByUserId(userId, { current_password, new_password, confirm_new_password } = {}) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('Invalid user_id');

  const current = String(current_password ?? '');
  const next = String(new_password ?? '');
  const confirm = String(confirm_new_password ?? '');

  if (next.length < 6) throw new Error('Password must be at least 6 characters');
  if (next !== confirm) throw new Error('Passwords do not match');

  await ensureOwnerProfileRow(uid);

  const res = await query('SELECT password_hash FROM owner_profile WHERE user_id = $1 LIMIT 1', [uid]);
  const stored = res.rows?.[0]?.password_hash ?? null;

  if (stored) {
    const ok = verifyPasswordScrypt(current, stored);
    if (!ok) throw new Error('Current password is incorrect');
  }

  const hashed = hashPasswordScrypt(next);
  await query('UPDATE owner_profile SET password_hash = $2 WHERE user_id = $1', [uid, hashed]);
  return { ok: true };
}

export function toPublicOwnerProfile(row) {
  if (!row) return null;

  return {
    username: String(row.username ?? ''),
    email: String(row.email ?? ''),
    phone_number: String(row.phone_number ?? ''),
    business_name: String(row.business_name ?? ''),
    business_address: String(row.business_address ?? ''),
  };
}

export function toPublicAccountInfo(row) {
  if (!row) return null;

  const expiresAt = row.account_expires_at ? new Date(row.account_expires_at).toISOString() : null;
  const memberSince = row.member_since ? new Date(row.member_since).toISOString() : null;
  const lastLogin = row.last_login_at ? new Date(row.last_login_at).toISOString() : null;

  const remainingDays = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000)))
    : null;

  return {
    account_status: String(row.account_status ?? 'Active'),
    account_expires_at: expiresAt,
    time_remaining_days: remainingDays,
    commission_rate: Number(row.commission_rate ?? 0.06),
    member_since: memberSince,
    last_login_at: lastLogin,
  };
}
