import { api } from './api';

function unwrapSuccess(responseData) {
	if (responseData && typeof responseData === 'object') {
		if (responseData.success === true) return responseData.data;
		if (responseData.success === false) {
			const message =
				(typeof responseData?.error === 'string' && responseData.error) ||
				responseData?.error?.message ||
				'Unable to complete request. Please try again.';
			const error = new Error(message);
			error.code = responseData?.error?.code;
			// Provide axios-like shape so callers can use err?.response?.data?.error safely.
			error.response = { data: { error: message } };
			throw error;
		}
	}

	// Some endpoints might return plain arrays/objects.
	return responseData;
}

export function getApiErrorMessage(err) {
	const code = String(err?.code ?? err?.response?.data?.error?.code ?? '').trim().toUpperCase();
	if (code === 'EXPIRED' || code === 'VOUCHER_EXPIRED') return 'Expired';
	if (code === 'USED' || code === 'VOUCHER_USED') return 'Voucher already used';
	if (code === 'INVALID' || code === 'VOUCHER_NOT_FOUND') return 'Invalid voucher';

	const backendError = err?.response?.data?.error;
	if (typeof backendError === 'string' && backendError.trim()) return backendError;
	if (backendError && typeof backendError === 'object') {
		const msg = backendError?.message;
		if (typeof msg === 'string' && msg.trim()) return msg;
	}

	const backendMessage = err?.response?.data?.message;
	if (typeof backendMessage === 'string' && backendMessage.trim()) return backendMessage;

	const message = err?.message;
	if (typeof message === 'string' && message.trim()) return message;

	return 'Request failed';
}

export async function fetchPortalContext(params) {
	const res = await api.get('/api/portal/context', { params });
	return unwrapSuccess(res.data);
}

export async function fetchPortalBundles() {
	const res = await api.get('/api/bundles', { params: { status: 'active' } });
	const payload = res?.data;
	if (payload && typeof payload === 'object' && payload.success === true && Array.isArray(payload.data)) {
		return payload.data
			.map((b) => {
				const id = String(b?.id ?? '').trim();
				const name = String(b?.name ?? '').trim();
				if (!id || !name) return null;
				return {
					id,
					name,
					price_ugx: b?.price_ugx == null ? 0 : Number(b.price_ugx),
					currency: 'UGX',
					duration_minutes: b?.duration_minutes == null ? null : Number(b.duration_minutes),
				};
			})
			.filter(Boolean);
	}

	return unwrapSuccess(payload);
}

export async function voucherLogin({ mac, ip, voucher_code }) {
	const res = await api.post('/api/portal/voucher-login', { mac, ip, voucher_code });
	return unwrapSuccess(res.data);
}

export async function voucherConnect({ voucher }) {
	const res = await api.post('/api/portal/voucher/connect', { voucher });
	return unwrapSuccess(res.data);
}

export async function createPortalPaymentIntent({ mac, ip, phone, bundle_id }) {
	const res = await api.post('/api/portal/pay', { mac, ip, phone, bundle_id, payment_provider: 'MTN' });
	return unwrapSuccess(res.data);
}


export async function buyBundle({ phone, bundle_id, bundleId } = {}) {
	const effectiveBundleId = bundle_id ?? bundleId;
	const res = await api.post('/api/portal/buy', { phone, bundle_id: effectiveBundleId, payment_provider: 'MTN' });
	return unwrapSuccess(res.data);
}
