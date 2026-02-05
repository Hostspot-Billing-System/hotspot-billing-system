function normalizeOneUgNumberToLocal07(raw) {
	const input = String(raw ?? '').trim();
	if (!input) return null;

	// Keep digits and leading plus.
	const cleaned = input.replace(/\s+/g, '').replace(/\(0\)/g, '');
	const digitsPlus = cleaned.replace(/[^0-9+]/g, '');

	// Strip leading plus if present for parsing.
	const digits = digitsPlus.startsWith('+') ? digitsPlus.slice(1) : digitsPlus;

	// Accept and normalize common UG formats:
	// - 07XXXXXXXX (10)
	// - 7XXXXXXXX (9)
	// - 2567XXXXXXXX (12)
	// - +2567XXXXXXXX
	if (/^07\d{8}$/.test(digits)) {
		return digits;
	}
	if (/^7\d{8}$/.test(digits)) {
		return `0${digits}`;
	}
	if (/^2567\d{8}$/.test(digits)) {
		return `0${digits.slice(3)}`;
	}

	return null;
}

/**
 * Normalizes one or more Ugandan phone numbers for UGSMS.
 * Accepts "0702913454" or comma-separated.
 * Returns a comma-separated local format string (e.g. "0702913454").
 */
export function normalizeUgPhoneNumbersForUgsms(numbers) {
	const raw = String(numbers ?? '').trim();
	if (!raw) return { ok: false, value: '', error: 'phone_required' };

	const parts = raw
		.split(',')
		.map((p) => p.trim())
		.filter(Boolean);

	if (!parts.length) return { ok: false, value: '', error: 'phone_required' };

	const normalized = [];
	for (const p of parts) {
		const n = normalizeOneUgNumberToLocal07(p);
		if (!n) return { ok: false, value: '', error: 'invalid_phone' };
		normalized.push(n);
	}

	return { ok: true, value: normalized.join(',') };
}
