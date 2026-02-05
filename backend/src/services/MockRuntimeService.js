import crypto from 'node:crypto';

class MockRuntimeError extends Error {
	constructor(code, message, httpStatus = 400) {
		super(message);
		this.code = code;
		this.httpStatus = httpStatus;
	}
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
	const a = Math.ceil(min);
	const b = Math.floor(max);
	return Math.floor(Math.random() * (b - a + 1)) + a;
}

function asVoucher(voucher) {
	return String(voucher ?? '').trim();
}

function durationMinutesForBundleName(name) {
	const n = String(name ?? '').trim().toLowerCase();
	if (n === '2h' || n === '2hr' || n === '2hrs' || n === '2 hours') return 2 * 60;
	if (n === '12h' || n === '12hr' || n === '12hrs' || n === '12 hours') return 12 * 60;
	if (n === 'daily' || n === 'day' || n === '1 day') return 24 * 60;
	if (n === 'weekly' || n === 'week' || n === '1 week') return 7 * 24 * 60;
	if (n === 'monthly' || n === 'month' || n === '30d' || n === '30 days') return 30 * 24 * 60;
	if (n === '12hrs') return 12 * 60;
	if (n === '24hrs') return 24 * 60;
	if (n === '7days') return 7 * 24 * 60;
	if (n === '30d') return 30 * 24 * 60;
	return null;
}

export class MockRuntimeService {
	async validateVoucher(voucher) {
		const code = asVoucher(voucher);
		await sleep(randomInt(800, 1200));

		if (code.startsWith('TEST-')) {
			console.log('[MOCK MODE] Voucher accepted', { voucher: code, rule: 'TEST-*' });
			return { valid: true, code };
		}

		if (code.length >= 6) {
			console.log('[MOCK MODE] Voucher accepted', { voucher: code, rule: 'len>=6' });
			return { valid: true, code };
		}

		return { valid: false, code, reason: 'Voucher is invalid' };
	}

	getBundles() {
		return [
			{ id: '2h', name: '2 Hours', price: 500, currency: 'UGX' },
			{ id: '12h', name: '12 Hours', price: 1000, currency: 'UGX' },
			{ id: 'daily', name: 'Daily', price: 1500, currency: 'UGX' },
			{ id: 'weekly', name: 'Weekly', price: 6000, currency: 'UGX' },
			{ id: 'monthly', name: 'Monthly', price: 23000, currency: 'UGX' },
		].map((b) => {
			const durationMinutes =
				durationMinutesForBundleName(b.id) ?? durationMinutesForBundleName(b.name) ?? null;
			return {
				id: b.id,
				name: b.name,
				profile: b.id,
				rateLimit: null,
				price: b.price,
				currency: b.currency,
				price_ugx: b.price,
				durationMinutes,
			};
		});
	}

	async connectSession(voucher) {
		const validation = await this.validateVoucher(voucher);
		if (!validation.valid) {
			throw new MockRuntimeError('INVALID_VOUCHER', validation.reason ?? 'Invalid voucher', 404);
		}

		const startedAt = new Date().toISOString();
		const chosenBundle = 'daily';
		const durationMinutes = durationMinutesForBundleName(chosenBundle) ?? 24 * 60;
		const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

		const session = {
			id: `mock_${crypto.randomBytes(6).toString('hex')}`,
			voucher: validation.code,
			status: 'CONNECTED',
			startedAt,
			expiresAt,
			durationMinutes,
			bundle: chosenBundle,
		};

		console.log('[MOCK MODE] Session created', { sessionId: session.id, voucher: session.voucher });
		return session;
	}

	async disconnectSession() {
		// In mock mode we don't track device sessions; just return a stable OK shape.
		return {
			disconnected: true,
			disconnectedAt: new Date().toISOString(),
		};
	}

	health() {
		return {
			status: 'online',
			mode: 'mock',
			identity: 'mikrotik-mock',
		};
	}
}

export const mockRuntimeService = new MockRuntimeService();
export { MockRuntimeError };