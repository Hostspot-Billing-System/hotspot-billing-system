import {
  getRequestUserId,
  getSmsSettingsByUserId,
  toPublicSmsSettings,
  upsertSmsSettingsByUserId,
} from '../services/smsSettingsService.js';
import { query } from '../config/db.js';

function defaultPublicSettings() {
  return {
    provider: 'ugsms',
    api_username: '',
    sender_id: '',
    use_custom_api: false,
    login_otp_enabled: false,
    withdrawal_otp_enabled: false,
    customer_voucher_sms_enabled: true,
    has_api_password: false,
    updated_at: null,
    last_used_at: null,
  };
}

async function safeGetLastUsedAt(userId) {
  try {
    const res = await query(
      `
      SELECT created_at
      FROM sms_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [Number(userId)]
    );
    const ts = res.rows?.[0]?.created_at ?? null;
    return ts ? new Date(ts).toISOString() : null;
  } catch {
    return null;
  }
}

export async function getSmsSettingsHandler(req, res) {
  try {
    const userId = getRequestUserId(req);
    const row = await getSmsSettingsByUserId(userId);
    const pub = toPublicSmsSettings(row) ?? defaultPublicSettings();

    const last_used_at = await safeGetLastUsedAt(userId);

    return res.status(200).json({
      success: true,
      data: {
        ...pub,
        last_used_at,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('GET /api/sms-settings failed:', err?.message ?? err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}

export async function putSmsSettingsHandler(req, res) {
  try {
    const userId = getRequestUserId(req);

    const saved = await upsertSmsSettingsByUserId(userId, req.body ?? {});
    const pub = toPublicSmsSettings(saved) ?? defaultPublicSettings();

    return res.status(200).json({
      success: true,
      data: pub,
    });
  } catch (err) {
    const msg = String(err?.message ?? 'Failed to save SMS settings');

    if (msg.toLowerCase().includes('missing encryption secret')) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'MISSING_SECRET',
          message: 'Server encryption secret not configured (set SMS_ENCRYPTION_SECRET)',
        },
      });
    }

    if (msg.toLowerCase().includes('sms_settings table is missing')) {
      return res.status(500).json({
        success: false,
        error: { code: 'SCHEMA_MISSING', message: 'SMS settings table is missing. Apply DB migrations.' },
      });
    }

    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: msg },
    });
  }
}
