class DomainError extends Error {
	constructor(code, message, httpStatus) {
		super(message);
		this.code = code;
		this.httpStatus = httpStatus;
	}
}

function normalizeText(value) {
	const trimmed = String(value ?? '').trim();
	return trimmed ? trimmed : null;
}

function parseRequiredPositiveMoney(value, fieldName) {
	const trimmed = String(value ?? '').trim();
	if (!trimmed) throw new DomainError('BAD_REQUEST', `${fieldName} is required`, 400);
	const n = Number(trimmed);
	if (!Number.isFinite(n) || n <= 0) {
		throw new DomainError('BAD_REQUEST', `${fieldName} must be a valid positive number`, 400);
	}
	return n;
}

export class MobileMoneyService {
	// Integration stub: replace with real provider(s) later.
	static async initiatePayment({ phone, amount_ugx, reference, bundle_id, mac, ip } = {}) {
		const msisdn = normalizeText(phone);
		const ref = normalizeText(reference);
		const amount = parseRequiredPositiveMoney(amount_ugx, 'amount_ugx');
		if (!msisdn) throw new DomainError('BAD_REQUEST', 'phone is required', 400);
		if (!ref) throw new DomainError('BAD_REQUEST', 'reference is required', 400);

		// For now we only simulate the request being accepted.
		// A real implementation would call MTN/Airtel APIs and return provider tracking ids.
		console.log('[MobileMoney] initiatePayment', {
			phone: msisdn,
			amount_ugx: amount,
			reference: ref,
			bundle_id: bundle_id ?? null,
			mac: mac ?? null,
			ip: ip ?? null,
		});

		return { accepted: true };
	}
}

export function toHttpError(err) {
	if (err instanceof DomainError) {
		return {
			httpStatus: err.httpStatus,
			body: { success: false, error: { code: err.code, message: err.message } },
		};
	}

	return {
		httpStatus: 502,
		body: {
			success: false,
			error: { code: 'PAYMENT_PROVIDER_ERROR', message: 'Failed to initiate payment' },
		},
	};
}
