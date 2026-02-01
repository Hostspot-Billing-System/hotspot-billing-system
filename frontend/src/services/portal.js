import { api } from './api';

function unwrapSuccess(responseData) {
	if (responseData && typeof responseData === 'object') {
		if (responseData.success === true) return responseData.data;
		if (responseData.success === false) {
			const message =
				(typeof responseData?.error === 'string' && responseData.error) ||
				responseData?.error?.message ||
				'Request failed';
			const error = new Error(message);
			error.code = responseData?.error?.code;
			throw error;
		}
	}

	// Some endpoints might return plain arrays/objects.
	return responseData;
}

export function getApiErrorMessage(err) {
	return (
		err?.response?.data?.error?.message ||
		err?.response?.data?.message ||
		err?.message ||
		'Request failed'
	);
}

export async function fetchPortalContext(params) {
	const res = await api.get('/api/portal/context', { params });
	return unwrapSuccess(res.data);
}

export async function fetchPortalBundles() {
	const res = await api.get('/api/portal/bundles');
	return unwrapSuccess(res.data);
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
	const res = await api.post('/api/portal/pay', { mac, ip, phone, bundle_id });
	return unwrapSuccess(res.data);
}

export async function buyBundle({ phone, bundle }) {
	const res = await api.post('/api/portal/buy', { phone, bundle });
	return unwrapSuccess(res.data);
}
