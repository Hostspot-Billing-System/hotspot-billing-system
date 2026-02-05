import { recordSmsSendError, recordSmsSendSuccess } from './smsStatusService.js';

import { query } from '../config/db.js';
import {
  getSmsSettingsByUserId,
  resolveUgsmsApiKeyFromSettings,
} from './smsSettingsService.js';

function isMockMode() {
  return String(process.env.SMS_MOCK ?? '').trim().toLowerCase() === 'true';
}

function normalizePhoneToE164UgOrThrow(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('phone_required');

  // Keep digits and leading plus.
  const cleaned = raw.replace(/\s+/g, '').replace(/\(0\)/g, '');
  const digits = cleaned.replace(/[^0-9+]/g, '');

  // Accept: 07xxxxxxxx, 2567xxxxxxxx, +2567xxxxxxxx
  let msisdn = digits;
  if (msisdn.startsWith('0')) {
    msisdn = `+256${msisdn.slice(1)}`;
  } else if (msisdn.startsWith('256')) {
    msisdn = `+${msisdn}`;
  }

  if (!msisdn.startsWith('+256')) throw new Error('invalid_country');
  const onlyDigits = msisdn.replace(/\D/g, '');
  // +256 + 9 digits (Uganda mobile) => 12 total digits after plus.
  if (onlyDigits.length !== 12) throw new Error('invalid_length');
  if (!onlyDigits.startsWith('2567')) throw new Error('invalid_msisdn');

  return `+${onlyDigits}`;
}

async function safeInsertSmsLog({ userId, provider, purpose, toNumber, message, success, httpStatus, responseBody, errorMessage }) {
  try {
    await query(
      `
      INSERT INTO sms_logs (
        user_id,
        provider,
        purpose,
        to_number,
        message,
        success,
        http_status,
        response_body,
        error_message
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [
        userId ?? null,
        provider ?? 'ugsms',
        purpose ?? null,
        String(toNumber ?? ''),
        String(message ?? ''),
        Boolean(success),
        httpStatus == null ? null : Number(httpStatus),
        responseBody == null ? null : String(responseBody).slice(0, 5000),
        errorMessage == null ? null : String(errorMessage).slice(0, 500),
      ]
    );
  } catch (err) {
    // Missing table or DB issues should never break core flows.
    // eslint-disable-next-line no-console
    console.warn('[sms] failed to write sms_logs:', err?.code ?? '', err?.message ?? err);
  }
}

function getDefaultUserId() {
  const raw = String(process.env.DEFAULT_SMS_USER_ID ?? '').trim();
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 1;
}

function getPortalLoginLink() {
  const explicit = String(process.env.PORTAL_LOGIN_URL ?? process.env.PUBLIC_PORTAL_URL ?? '').trim();
  if (explicit) return explicit;
  // Relative fallback (works when clicked from within same domain).
  return '/portal';
}

async function sendViaUgsms({ apiKey, senderId, toNumber, message, purpose }) {
  const url = String(process.env.UGSMS_API_URL ?? 'https://ugsms.com/api/v2/sms/send').trim();

  const messageType = String(purpose ?? '').toLowerCase().includes('otp') ? 'otp' : 'transactional';

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      numbers: toNumber,
      message_body: message,
      sender_id: senderId,
      message_type: messageType,
    }),
  });

  const httpStatus = resp.status;
  let bodyText = null;
  try {
    bodyText = await resp.text();
  } catch {
    bodyText = null;
  }

  let json = null;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    json = null;
  }

  const ok = Boolean(resp.ok && (json?.success === true || json?.status === 'success'));
  return { ok, httpStatus, responseBody: bodyText, json };
}

export async function sendSMS({ userId, to, message, purpose } = {}) {
  const resolvedUserId = userId == null ? getDefaultUserId() : userId;
  const provider = 'ugsms';
  const safeMessage = String(message ?? '').trim();

  let toNumber;
  try {
    toNumber = normalizePhoneToE164UgOrThrow(to);
  } catch (err) {
    recordSmsSendError();
    await safeInsertSmsLog({
      userId: resolvedUserId,
      provider,
      purpose,
      toNumber: String(to ?? ''),
      message: safeMessage,
      success: false,
      httpStatus: null,
      responseBody: null,
      errorMessage: err?.message ?? 'invalid_phone',
    });
    return { ok: false, error: 'invalid_phone' };
  }

  if (!safeMessage) {
    recordSmsSendError();
    await safeInsertSmsLog({
      userId: resolvedUserId,
      provider,
      purpose,
      toNumber,
      message: '',
      success: false,
      httpStatus: null,
      responseBody: null,
      errorMessage: 'empty_message',
    });
    return { ok: false, error: 'empty_message' };
  }

  let settings = null;
  try {
    settings = await getSmsSettingsByUserId(resolvedUserId);
  } catch {
    settings = null;
  }

  const customerVoucherEnabled = settings ? Boolean(settings.customer_voucher_sms_enabled) : true;
  if (!customerVoucherEnabled) {
    // Respect user preference: skip sending.
    recordSmsSendSuccess();
    await safeInsertSmsLog({
      userId: resolvedUserId,
      provider,
      purpose,
      toNumber,
      message: safeMessage,
      success: true,
      httpStatus: null,
      responseBody: 'SKIPPED_DISABLED',
      errorMessage: null,
    });
    return { ok: true, skipped: true };
  }

  // SMS_MOCK: log only (dev-friendly)
  if (isMockMode()) {
    // eslint-disable-next-line no-console
    console.log('[sms][mock]', { to: toNumber, purpose: purpose ?? null, message: safeMessage });
    recordSmsSendSuccess();
    await safeInsertSmsLog({
      userId: resolvedUserId,
      provider,
      purpose,
      toNumber,
      message: safeMessage,
      success: true,
      httpStatus: 200,
      responseBody: 'MOCK',
      errorMessage: null,
    });
    return { ok: true, mocked: true };
  }

  try {
    if (String(process.env.SMS_STUB_FORCE_FAIL ?? '') === '1') {
      throw new Error('SMS_STUB_FORCE_FAIL');
    }

    const useCustom = settings ? Boolean(settings.use_custom_api) : false;
    const apiKey = useCustom
      ? resolveUgsmsApiKeyFromSettings(settings)
      : String(process.env.UGSMS_API_KEY ?? '').trim();

    const senderId = useCustom
      ? String(settings?.sender_id ?? '').trim()
      : String(process.env.UGSMS_SENDER_ID ?? '').trim();

    if (!apiKey) {
      throw new Error(useCustom ? 'missing_custom_api_key' : 'missing_default_api_key');
    }
    if (!senderId) {
      throw new Error(useCustom ? 'missing_custom_sender_id' : 'missing_default_sender_id');
    }

    const result = await sendViaUgsms({ apiKey, senderId, toNumber, message: safeMessage, purpose });
    if (result.ok) {
      recordSmsSendSuccess();
      await safeInsertSmsLog({
        userId: resolvedUserId,
        provider,
        purpose,
        toNumber,
        message: safeMessage,
        success: true,
        httpStatus: result.httpStatus,
        responseBody: result.responseBody,
        errorMessage: null,
      });
      return { ok: true };
    }

    recordSmsSendError();
    await safeInsertSmsLog({
      userId: resolvedUserId,
      provider,
      purpose,
      toNumber,
      message: safeMessage,
      success: false,
      httpStatus: result.httpStatus,
      responseBody: result.responseBody,
      errorMessage: 'provider_failed',
    });
    return { ok: false, error: 'provider_failed' };
  } catch (err) {
    recordSmsSendError();
    await safeInsertSmsLog({
      userId: resolvedUserId,
      provider,
      purpose,
      toNumber,
      message: safeMessage,
      success: false,
      httpStatus: null,
      responseBody: null,
      errorMessage: err?.message ?? 'sms_failed',
    });
    return { ok: false, error: err?.message ?? 'sms_failed' };
  }
}

// Stubbed SMS sender.
// - Never throws unless SMS_STUB_FORCE_FAIL=1 (useful for testing error handling).
// - Records send success/error for the admin dashboard SMS status widget.
export async function sendVoucherDirectSaleSms({ to, voucherCode, bundleName, priceUgx, durationMinutes } = {}) {
  const code = String(voucherCode ?? '').trim();
  const name = String(bundleName ?? '').trim();
  const price = Number(priceUgx ?? 0);
  const duration = Number(durationMinutes);
  const portalLink = getPortalLoginLink();

  const expiresAt = Number.isFinite(duration) && duration > 0 ? new Date(Date.now() + duration * 60 * 1000) : null;
  const expiryReadable = expiresAt
    ? (() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const targetDay = new Date(expiresAt.getFullYear(), expiresAt.getMonth(), expiresAt.getDate());
        const timeStr = expiresAt.toLocaleTimeString('en-UG', { hour: 'numeric', minute: '2-digit' });

        if (targetDay.getTime() === today.getTime()) return `Today at ${timeStr}`;
        if (targetDay.getTime() === tomorrow.getTime()) return `Tomorrow at ${timeStr}`;

        const dateStr = expiresAt.toLocaleDateString('en-UG', { month: 'short', day: 'numeric', year: 'numeric' });
        return `${dateStr} at ${timeStr}`;
      })()
    : '';

  const message = `
Welcome to Omega WiFi
Code: ${code}
Plan: ${name}
Valid until: ${expiryReadable}

Tap to connect:
${portalLink}
`.trim();

  return sendSMS({
    userId: getDefaultUserId(),
    to,
    message,
    purpose: 'customer_voucher',
  });
}
