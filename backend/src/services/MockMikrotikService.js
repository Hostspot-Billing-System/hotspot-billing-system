import { randomUUID, randomBytes } from 'node:crypto';

function safeRandomUUID() {
	if (typeof randomUUID === 'function') return randomUUID();
	return randomBytes(16).toString('hex');
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampInt(value, { min, max, fallback }) {
	const n = Number.parseInt(String(value), 10);
	if (!Number.isFinite(n)) return fallback;
	if (n < min) return min;
	if (n > max) return max;
	return n;
}

/**
 * Mock MikroTik service that simulates RouterOS behavior without any router.
 *
 * Guarantees:
 * - Adds 300–800ms latency per call by default
 * - Never throws unless explicitly forced
 * - Generates realistic timestamps and keeps an in-memory session table
 */
export class MockMikrotikService {
	/**
	 * @param {object} [options]
	 * @param {string} [options.identity]
	 * @param {[number, number]} [options.latencyMsRange]
	 * @param {boolean} [options.forceThrow] If true, every call throws.
	 */
	constructor(options = {}) {
		this.identity = options.identity ?? 'mikrotik-mock';
		this.latencyMsRange = Array.isArray(options.latencyMsRange)
			? options.latencyMsRange
			: [300, 800];
		this.forceThrow = Boolean(options.forceThrow);

		/** @type {Map<string, any>} */
		this.sessions = new Map();
	}

	async #withLatency() {
		const [min, max] = this.latencyMsRange;
		const minMs = clampInt(min, { min: 0, max: 60_000, fallback: 300 });
		const maxMs = clampInt(max, { min: minMs, max: 60_000, fallback: 800 });
		const ms = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
		await sleep(ms);
	}

	#maybeThrow(forceThrow) {
		if (this.forceThrow || forceThrow === true) {
			const err = new Error('MockMikrotikService forced error');
			err.code = 'MOCK_FORCED_ERROR';
			throw err;
		}
	}

	/**
	 * Simulates connecting to a router.
	 * @param {object} [options]
	 * @param {boolean} [options.forceThrow]
	 */
	async connect(options = {}) {
		await this.#withLatency();
		this.#maybeThrow(options.forceThrow);
		return { ok: true, identity: this.identity };
	}

	/**
	 * Simulates authorizing a user (voucher-based session) and returns a session id.
	 *
	 * @param {object} params
	 * @param {string} params.mac
	 * @param {string} params.ip
	 * @param {string} params.voucher
	 * @param {number} params.durationMinutes
	 * @param {object} [options]
	 * @param {boolean} [options.forceThrow]
	 */
	async authorizeUser({ mac, ip, voucher, durationMinutes } = {}, options = {}) {
		await this.#withLatency();
		this.#maybeThrow(options.forceThrow);

		const now = new Date();
		const duration = Number.isFinite(Number(durationMinutes)) && Number(durationMinutes) > 0 ? Number(durationMinutes) : 60;
		const expiresAtDate = new Date(now.getTime() + duration * 60 * 1000);

		const sessionId = `mock-${safeRandomUUID()}`;
		this.sessions.set(sessionId, {
			sessionId,
			mac: mac ?? null,
			ip: ip ?? null,
			voucher: voucher ?? null,
			durationMinutes: duration,
			createdAt: now.toISOString(),
			expiresAt: expiresAtDate.toISOString(),
			disconnectedAt: null,
		});

		return { ok: true, sessionId, expiresAt: expiresAtDate.toISOString() };
	}

	/**
	 * Simulates disconnecting a user session.
	 * @param {object} params
	 * @param {string} params.sessionId
	 * @param {object} [options]
	 * @param {boolean} [options.forceThrow]
	 */
	async disconnectUser({ sessionId } = {}, options = {}) {
		await this.#withLatency();
		this.#maybeThrow(options.forceThrow);

		if (sessionId && this.sessions.has(sessionId)) {
			const session = this.sessions.get(sessionId);
			this.sessions.set(sessionId, {
				...session,
				disconnectedAt: new Date().toISOString(),
			});
		}

		return { ok: true };
	}
}
