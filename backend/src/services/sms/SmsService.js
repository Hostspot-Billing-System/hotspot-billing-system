import { UGSmsProvider } from './providers/UGSmsProvider.js';
import { normalizeUgPhoneNumbersForUgsms } from './utils/normalizeUgPhoneNumbers.js';

function resolveSmsProvider() {
	const raw = String(process.env.SMS_PROVIDER ?? '').trim().toLowerCase();
	// Currently support ONLY "ug_sms".
	if (!raw) return 'ug_sms';
	return raw;
}

function formatVoucherMessage({ voucherCode, bundleName, expiresAt }) {
	const voucher = String(voucherCode ?? '').trim();
	const bundle = String(bundleName ?? '').trim();
	const date = String(expiresAt ?? '').trim();

	return `Your WiFi voucher: ${voucher}\nPackage: ${bundle}\nExpires: ${date}\nThank you.`;
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
