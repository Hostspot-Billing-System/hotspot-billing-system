import { recordSmsSendError, recordSmsSendSuccess } from './smsStatusService.js';

// Stubbed SMS sender.
// - Never throws unless SMS_STUB_FORCE_FAIL=1 (useful for testing error handling).
// - Records send success/error for the admin dashboard SMS status widget.
export async function sendVoucherDirectSaleSms({ to, voucherCode, bundleName, priceUgx } = {}) {
  const phone = String(to ?? '').trim();
  const code = String(voucherCode ?? '').trim();

  if (!phone || !code) {
    // Treat as a no-op but track error so it surfaces in metrics.
    recordSmsSendError();
    return { ok: false, error: 'missing_to_or_code' };
  }

  try {
    if (String(process.env.SMS_STUB_FORCE_FAIL ?? '') === '1') {
      throw new Error('SMS_STUB_FORCE_FAIL');
    }

    // Real provider integration will go here.
    void bundleName;
    void priceUgx;

    recordSmsSendSuccess();
    return { ok: true };
  } catch (err) {
    recordSmsSendError();
    return { ok: false, error: err?.message ?? 'sms_failed' };
  }
}
