import { UGSmsProvider } from './providers/UGSmsProvider.js';
import { normalizeUgPhoneNumbersForUgsms } from './utils/normalizeUgPhoneNumbers.js';

function resolveSmsProvider() {
	const raw = String(process.env.SMS_PROVIDER ?? '').trim().toLowerCase();
	// Currently support ONLY "ug_sms".
	if (!raw) return 'ug_sms';
	return raw;
}

function formatExpiryReadable(expiresAt) {
	const raw = String(expiresAt ?? '').trim();
	const d = raw ? new Date(raw) : null;
	if (!d || Number.isNaN(d.getTime())) return raw;

	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

	const timeStr = d.toLocaleTimeString('en-UG', {
		hour: 'numeric',
		minute: '2-digit',
	});

	if (targetDay.getTime() === today.getTime()) {
		return `Today at ${timeStr}`;
	}
	if (targetDay.getTime() === tomorrow.getTime()) {
		return `Tomorrow at ${timeStr}`;
	}

	const dateStr = d.toLocaleDateString('en-UG', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
	return `${dateStr} at ${timeStr}`;
}

function formatVoucherMessage({ voucherCode, bundleName, expiresAt }) {
	const voucher = String(voucherCode ?? '').trim();
	const bundle = String(bundleName ?? '').trim();
	const date = formatExpiryReadable(expiresAt);

	return `
Welcome to Omega WiFi
Code: ${voucher}
Plan: ${bundle}
Valid until: ${date}

Tap to connect:
${String(process.env.PORTAL_LOGIN_URL ?? process.env.PUBLIC_PORTAL_URL ?? '/portal').trim()}
`.trim();
}

export const SmsService = {
	/**
	 * Sends the voucher SMS to a customer.
	 * Never throws; returns provider-normalized result.
	 */
	async sendCustomerVoucherSms({ phone, voucherCode, bundleName, expiresAt } = {}) {
		const providerKey = resolveSmsProvider();
		if (providerKey !== 'ug_sms') {
			return {
				success: false,
				provider: 'UGSMS',
				rawResponse: { success: false, error: `Unsupported SMS_PROVIDER: ${providerKey}` },
				errorMessage: `Unsupported SMS_PROVIDER: ${providerKey}`,
			};
		}

		const normalized = normalizeUgPhoneNumbersForUgsms(phone);
		if (!normalized.ok) {
			return {
				success: false,
				provider: 'UGSMS',
				rawResponse: { success: false, error: normalized.error },
				errorMessage: normalized.error,
			};
		}

		const message = formatVoucherMessage({ voucherCode, bundleName, expiresAt });
		return await UGSmsProvider.sendSms({ numbers: normalized.value, message });
	},
};
