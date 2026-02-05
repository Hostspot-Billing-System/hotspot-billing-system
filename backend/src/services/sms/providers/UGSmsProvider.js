const DEFAULT_TIMEOUT_MS = 15_000;

function normalizeBaseUrl(raw) {
	const base = String(raw ?? '').trim();
	if (!base) return '';
	return base.endsWith('/') ? base.slice(0, -1) : base;
}

async function readJsonOrText(resp) {
	const text = await resp.text();
	if (!text) return { text: null, json: null };
	try {
		return { text, json: JSON.parse(text) };
	} catch {
		return { text, json: null };
	}
}

export const UGSmsProvider = {
	/**
	 * Send SMS using UGSMS API v2.
	 * @param {{numbers: string, message: string}} params
	 * @returns {Promise<{success: boolean, provider: 'UGSMS', rawResponse: any, errorMessage?: string}>}
	 */
	async sendSms({ numbers, message } = {}) {
		const apiKey = String(process.env.UGSMS_API_KEY ?? '').trim();
		const baseUrl = normalizeBaseUrl(process.env.UGSMS_BASE_URL ?? '');
		const senderId = String(process.env.UGSMS_SENDER_ID ?? '').trim();

		if (!apiKey) {
			return {
				success: false,
				provider: 'UGSMS',
				rawResponse: { success: false, error: 'missing_api_key' },
				errorMessage: 'UGSMS_API_KEY is missing',
			};
		}

		if (!baseUrl) {
			return {
				success: false,
				provider: 'UGSMS',
				rawResponse: { success: false, error: 'missing_base_url' },
				errorMessage: 'UGSMS_BASE_URL is missing',
			};
		}

		if (!senderId) {
			return {
				success: false,
				provider: 'UGSMS',
				rawResponse: { success: false, error: 'missing_sender_id' },
				errorMessage: 'UGSMS_SENDER_ID is missing',
			};
		}

		const to = String(numbers ?? '').trim();
		const body = String(message ?? '').trim();
		if (!to) {
			return {
				success: false,
				provider: 'UGSMS',
				rawResponse: { success: false, error: 'missing_numbers' },
				errorMessage: 'numbers is required',
			};
		}
		if (!body) {
			return {
				success: false,
				provider: 'UGSMS',
				rawResponse: { success: false, error: 'missing_message' },
				errorMessage: 'message is required',
			};
		}

		const url = `${baseUrl}/sms/send`;

		const abort = new AbortController();
		const timeoutMsRaw = Number(process.env.UGSMS_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
		const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : DEFAULT_TIMEOUT_MS;
		const timer = setTimeout(() => abort.abort(), timeoutMs);

		try {
			const resp = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-API-Key': apiKey,
				},
				body: JSON.stringify({
					numbers: to,
					message_body: body,
					sender_id: senderId,
				}),
				signal: abort.signal,
			});

			const { text, json } = await readJsonOrText(resp);
			const data = json ?? (text ? { raw: text } : null);

			if (json && json.success === true) {
				return { success: true, provider: 'UGSMS', rawResponse: data };
			}

			if (json && json.success === false) {
				const reason = String(json.message ?? json.error ?? 'UGSMS returned success=false').trim();
				return { success: false, provider: 'UGSMS', rawResponse: data, errorMessage: reason || 'UGSMS returned success=false' };
			}

			if (!resp.ok) {
				return {
					success: false,
					provider: 'UGSMS',
					rawResponse: data,
					errorMessage: `UGSMS HTTP ${resp.status}`,
				};
			}

			// If API doesn't include {success: boolean}, treat as failure to be safe.
			return {
				success: false,
				provider: 'UGSMS',
				rawResponse: data,
				errorMessage: 'Unexpected UGSMS response shape',
			};
		} catch (err) {
			const msg = err?.name === 'AbortError' ? 'UGSMS request timed out' : String(err?.message ?? err);
			return {
				success: false,
				provider: 'UGSMS',
				rawResponse: { error: msg },
				errorMessage: msg,
			};
		} finally {
			clearTimeout(timer);
		}
	},
};
