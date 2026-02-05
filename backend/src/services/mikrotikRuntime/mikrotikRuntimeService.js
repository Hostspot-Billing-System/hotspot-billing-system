import { disconnectHotspotUser, listHotspotActive, upsertHotspotUser } from './runtimeService.js';
import {
	getHotspotUser,
	listHotspotProfiles,
	listHotspotUsers,
	setHotspotUserDisabled,
	removeHotspotUser,
	runtimeHealthCheck,
} from './runtimeService.js';

import { MikroTikApiClient } from '../../integrations/mikrotik/MikroTikApiClient.js';

class DomainError extends Error {
	constructor(code, message, httpStatus) {
		super(message);
		this.code = code;
		this.httpStatus = httpStatus;
	}
}

function toLimitUptimeFromMinutes(durationMinutes) {
	const minutes = Number(durationMinutes);
	if (!Number.isFinite(minutes) || minutes <= 0) return null;
	// RouterOS accepts "120m" style values.
	return `${Math.floor(minutes)}m`;
}

export async function activateVoucherAccess({ voucherCode, bundleId, durationMinutes }) {
	const code = String(voucherCode ?? '').trim();
	if (!code) throw new DomainError('BAD_REQUEST', 'voucherCode is required', 400);

	const safeBundleId = Number(bundleId);
	if (!Number.isFinite(safeBundleId) || safeBundleId <= 0) {
		throw new DomainError('BAD_REQUEST', 'bundleId must be a valid number', 400);
	}

	const profileName = `hotspot_${safeBundleId}`;
	const limit_uptime = toLimitUptimeFromMinutes(durationMinutes);

	await upsertHotspotUser({
		username: code,
		password: code,
		profile: profileName,
		limit_uptime,
		disabled: false,
	});

	// Force the device to re-auth immediately.
	await disconnectHotspotUser({ username: code });

	return { profile: profileName, limit_uptime };
}

// Runtime (router-source-of-truth) API used by controllers.

export async function getRuntimeBundles() {
	// Bundles == hotspot profiles.
	return listHotspotProfiles();
}

export async function getRuntimeHotspotUsers() {
	return listHotspotUsers();
}

export async function getRuntimeHotspotActive({ user } = {}) {
	return listHotspotActive({ user });
}

export async function getRuntimeHotspotUser(username) {
	return getHotspotUser(username);
}

export async function upsertRuntimeHotspotUser(payload) {
	return upsertHotspotUser(payload);
}

export async function setRuntimeHotspotUserDisabled({ username, disabled }) {
	return setHotspotUserDisabled({ username, disabled });
}

export async function deleteRuntimeHotspotUser({ username }) {
	return removeHotspotUser({ username });
}

export async function disconnectRuntimeHotspotUser({ username }) {
	return disconnectHotspotUser({ username });
}

export async function getRuntimeHealth() {
	return runtimeHealthCheck();
}

function normalizeMacAsUsername(mac) {
	const raw = String(mac ?? '').trim().toUpperCase();
	// Use a stable, RouterOS-friendly username: remove separators.
	const compact = raw.replace(/[^0-9A-F]/g, '');
	if (!compact || compact.length < 12) {
		throw new DomainError('BAD_REQUEST', 'mac must be a valid MAC address', 400);
	}
	return compact;
}

function normalizeMacForCompare(mac) {
	return String(mac ?? '')
		.trim()
		.toUpperCase()
		.replace(/-/g, ':');
}

function parseRouterOsDurationSeconds(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return null;

	// Common RouterOS forms: "00:30:00" or "1d2h3m4s".
	if (raw.includes(':')) {
		const parts = raw.split(':').map((p) => Number(p));
		if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
		if (parts.length === 3) {
			const [h, m, s] = parts;
			return h * 3600 + m * 60 + s;
		}
		if (parts.length === 4) {
			const [d, h, m, s] = parts;
			return d * 86400 + h * 3600 + m * 60 + s;
		}
		return null;
	}

	let total = 0;
	const re = /(\d+)(w|d|h|m|s)/gi;
	let match;
	while ((match = re.exec(raw))) {
		const n = Number(match[1]);
		const unit = String(match[2]).toLowerCase();
		if (!Number.isFinite(n)) continue;
		if (unit === 'w') total += n * 7 * 86400;
		else if (unit === 'd') total += n * 86400;
		else if (unit === 'h') total += n * 3600;
		else if (unit === 'm') total += n * 60;
		else if (unit === 's') total += n;
	}

	return total > 0 ? total : null;
}

export async function getActiveHotspotSessionForMac({ mac } = {}) {
	const target = normalizeMacForCompare(mac);
	if (!target) throw new DomainError('BAD_REQUEST', 'mac is required', 400);

	const active = await listHotspotActive({});
	const match = (active ?? []).find((s) => normalizeMacForCompare(s?.mac_address) === target) ?? null;
	if (!match) {
		return { connected: false, expires_at: null };
	}

	const secondsLeft = parseRouterOsDurationSeconds(match.session_time_left);
	const expiresAt = secondsLeft != null ? new Date(Date.now() + secondsLeft * 1000).toISOString() : null;

	return {
		connected: true,
		expires_at: expiresAt,
	};
}

export async function activateMobileMoneyAccess({ mac, bundleId, durationMinutes }) {
	const username = normalizeMacAsUsername(mac);

	const safeBundleId = Number(bundleId);
	if (!Number.isFinite(safeBundleId) || safeBundleId <= 0) {
		throw new DomainError('BAD_REQUEST', 'bundleId must be a valid number', 400);
	}

	const profileName = `hotspot_${safeBundleId}`;
	const limit_uptime = toLimitUptimeFromMinutes(durationMinutes);

	await upsertHotspotUser({
		username,
		password: username,
		profile: profileName,
		limit_uptime,
		disabled: false,
	});

	await disconnectHotspotUser({ username });

	return { username, profile: profileName, limit_uptime };
}

const client = new MikroTikApiClient();

export const mikrotikRuntimeService = {
	async health() {
		try {
			const identityRows = await client.healthCheck();
			const identity = identityRows?.[0]?.name ?? null;
			return {
				status: 'online',
				identity,
				mode: 'real',
			};
		} catch (err) {
			return {
				status: 'offline',
				identity: null,
				mode: 'real',
				error: err?.message ?? String(err),
				code: err?.code ?? null,
			};
		}
	},

	async listBundles() {
		return client.getHotspotProfiles();
	},

	async listActiveSessions() {
		return client.getActiveSessions();
	},

	async createVoucher({ code, profile }) {
		return client.createVoucher({
			username: code,
			password: code,
			profile,
		});
	},

	async createUser({ username, password, profile }) {
		return client.createVoucher({
			username,
			password,
			profile,
		});
	},

	async removeUser(username) {
		return client.removeHotspotUser(username);
	},

	async disconnectUser(username) {
		return client.disconnectUser(username);
	},
};
