import { apiFetch } from '../utils/requests';

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

	const search = params ? `?${new URLSearchParams(params).toString()}` : '';
	const data = await apiFetch(`/api/portal/context${search}`);
	return unwrapSuccess(data);
}

	const data = await apiFetch('/api/bundles?status=active');
	if (data && typeof data === 'object' && data.success === true && Array.isArray(data.data)) {
		return data.data
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
	return unwrapSuccess(data);
}

	const data = await apiFetch('/api/portal/voucher-login', {
		method: 'POST',
		body: JSON.stringify({ mac, ip, voucher_code }),
		credentials: 'include',
	});
	return unwrapSuccess(data);
}

	const data = await apiFetch('/api/portal/voucher/connect', {
		method: 'POST',
		body: JSON.stringify({ voucher }),
		credentials: 'include',
	});
	return unwrapSuccess(data);
}

	const data = await apiFetch('/api/portal/pay', {
		method: 'POST',
		body: JSON.stringify({ mac, ip, phone, bundle_id, payment_provider: 'MTN' }),
		credentials: 'include',
	});
	return unwrapSuccess(data);
}


	const effectiveBundleId = bundle_id ?? bundleId;
	const data = await apiFetch('/api/portal/buy', {
		method: 'POST',
		body: JSON.stringify({ phone, bundle_id: effectiveBundleId, payment_provider: 'MTN' }),
		credentials: 'include',
	});
	return unwrapSuccess(data);
}

// Flutterwave mobile money (MTN/Airtel Uganda)
export async function initiateFlutterwavePayment({ phoneNumber, bundleId, network } = {}) {
	const data = await apiFetch('/api/payments/flutterwave/initiate', {
		method: 'POST',
		body: JSON.stringify({ phoneNumber, bundleId, network }),
		credentials: 'include',
	});
	return unwrapSuccess(data);
}

export async function fetchPaymentStatus(txRef) {
	const ref = String(txRef ?? '').trim();
	const data = await apiFetch(`/api/payments/status/${encodeURIComponent(ref)}`);
	return unwrapSuccess(data);
}
