import { query } from '../config/db.js';
import { decryptSmsSecret, encryptSmsSecret } from '../utils/smsCrypto.js';

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  return defaultValue;
}

function normalizeProvider(value) {
  const p = String(value ?? 'ugsms').trim().toLowerCase();
  if (!p) return 'ugsms';
  if (p !== 'ugsms') throw new Error('Unsupported provider');
  return 'ugsms';
}

function normalizeOptionalText(value) {
  const s = String(value ?? '').trim();
  return s ? s : null;
}

export function getRequestUserId(req) {
  // The current codebase does not have auth-context wiring.
  // Support an explicit header for future multi-tenant use, otherwise default to 1.
  const header = req?.headers?.['x-user-id'];
  const raw = Array.isArray(header) ? header[0] : header;
  const n = Number(String(raw ?? '').trim());
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 1;
}

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

export async function getSmsSettingsByUserId(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return null;

  const tableExists = await hasTable('sms_settings');
  if (!tableExists) return null;

  const res = await query(
    `
    SELECT
      user_id,
      provider,
      api_username,
      api_password_encrypted,
      sender_id,
      use_custom_api,
      login_otp_enabled,
      withdrawal_otp_enabled,
      customer_voucher_sms_enabled,
      updated_at
    FROM sms_settings
    WHERE user_id = $1
    LIMIT 1
    `,
    [uid]
  );

  const row = res.rows?.[0] ?? null;
  if (!row) return null;

  return {
    user_id: Number(row.user_id),
    provider: String(row.provider ?? 'ugsms'),
    api_username: row.api_username ?? null,
    api_password_encrypted: row.api_password_encrypted ?? null,
    sender_id: row.sender_id ?? null,
    use_custom_api: Boolean(row.use_custom_api),
    login_otp_enabled: Boolean(row.login_otp_enabled),
    withdrawal_otp_enabled: Boolean(row.withdrawal_otp_enabled),
    customer_voucher_sms_enabled: Boolean(row.customer_voucher_sms_enabled),
    updated_at: row.updated_at ?? null,
  };
}

export async function upsertSmsSettingsByUserId(userId, payload = {}) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('Invalid user_id');

  const tableExists = await hasTable('sms_settings');
  if (!tableExists) {
    throw new Error('sms_settings table is missing. Apply migrations first.');
  }

  const provider = normalizeProvider(payload?.provider);
  const api_username = normalizeOptionalText(payload?.api_username);
  const sender_id = normalizeOptionalText(payload?.sender_id);

  const use_custom_api = toBool(payload?.use_custom_api, false);
  const login_otp_enabled = toBool(payload?.login_otp_enabled, false);
  const withdrawal_otp_enabled = toBool(payload?.withdrawal_otp_enabled, false);
  const customer_voucher_sms_enabled = toBool(payload?.customer_voucher_sms_enabled, true);

  // Password update semantics:
  // - undefined/null/empty string => keep existing
  // - any non-empty => encrypt+replace
  const apiPasswordRaw = payload?.api_password;
  const wantsUpdate = apiPasswordRaw !== undefined && apiPasswordRaw !== null && String(apiPasswordRaw).trim() !== '';

  let api_password_encrypted = null;
  if (wantsUpdate) {
    api_password_encrypted = encryptSmsSecret(String(apiPasswordRaw));
  }

  const res = await query(
    `
    INSERT INTO sms_settings (
      user_id,
      provider,
      api_username,
      api_password_encrypted,
      sender_id,
      use_custom_api,
      login_otp_enabled,
      withdrawal_otp_enabled,
      customer_voucher_sms_enabled
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9
    )
    ON CONFLICT (user_id) DO UPDATE SET
      provider = EXCLUDED.provider,
      api_username = EXCLUDED.api_username,
      api_password_encrypted = COALESCE(EXCLUDED.api_password_encrypted, sms_settings.api_password_encrypted),
      sender_id = EXCLUDED.sender_id,
      use_custom_api = EXCLUDED.use_custom_api,
      login_otp_enabled = EXCLUDED.login_otp_enabled,
      withdrawal_otp_enabled = EXCLUDED.withdrawal_otp_enabled,
      customer_voucher_sms_enabled = EXCLUDED.customer_voucher_sms_enabled,
      updated_at = NOW()
    RETURNING
      user_id,
      provider,
      api_username,
      api_password_encrypted,
      sender_id,
      use_custom_api,
      login_otp_enabled,
      withdrawal_otp_enabled,
      customer_voucher_sms_enabled,
      updated_at
    `,
    [
      uid,
      provider,
      api_username,
      api_password_encrypted,
      sender_id,
      use_custom_api,
      login_otp_enabled,
      withdrawal_otp_enabled,
      customer_voucher_sms_enabled,
    ]
  );

  const row = res.rows?.[0] ?? null;
  if (!row) throw new Error('Failed to save settings');

  return {
    user_id: Number(row.user_id),
    provider: String(row.provider ?? 'ugsms'),
    api_username: row.api_username ?? null,
    api_password_encrypted: row.api_password_encrypted ?? null,
    sender_id: row.sender_id ?? null,
    use_custom_api: Boolean(row.use_custom_api),
    login_otp_enabled: Boolean(row.login_otp_enabled),
    withdrawal_otp_enabled: Boolean(row.withdrawal_otp_enabled),
    customer_voucher_sms_enabled: Boolean(row.customer_voucher_sms_enabled),
    updated_at: row.updated_at ?? null,
  };
}

export function toPublicSmsSettings(settingsRow) {
  if (!settingsRow) return null;

  return {
    provider: settingsRow.provider ?? 'ugsms',
    api_username: settingsRow.api_username ?? '',
    sender_id: settingsRow.sender_id ?? '',
    use_custom_api: Boolean(settingsRow.use_custom_api),
    login_otp_enabled: Boolean(settingsRow.login_otp_enabled),
    withdrawal_otp_enabled: Boolean(settingsRow.withdrawal_otp_enabled),
    customer_voucher_sms_enabled: Boolean(settingsRow.customer_voucher_sms_enabled),
    has_api_password: Boolean(String(settingsRow.api_password_encrypted ?? '').trim()),
    updated_at: settingsRow.updated_at ?? null,
  };
}

export function resolveUgsmsApiKeyFromSettings(settingsRow) {
  if (!settingsRow) return null;
  const encrypted = String(settingsRow.api_password_encrypted ?? '').trim();
  if (encrypted) {
    try {
      const decrypted = decryptSmsSecret(encrypted);
      if (decrypted) return decrypted;
    } catch {
      // Treat as missing.
    }
  }

  // Some accounts treat a single API key as the "username".
  const fallback = String(settingsRow.api_username ?? '').trim();
  return fallback || null;
}
