import net from 'node:net';

import { query } from '../config/db.js';

export class PortalSessionError extends Error {
	constructor(code, message, httpStatus = 400) {
		super(message);
		this.code = code;
		this.httpStatus = httpStatus;
	}
}

function hasValue(v) {
	return v !== undefined && v !== null && String(v).trim() !== '';
}

function normalizeMac(mac) {
	if (!hasValue(mac)) {
		throw new PortalSessionError('BAD_REQUEST', 'mac is required', 400);
	}

	const raw = String(mac).trim();
	const match = raw.match(/^([0-9A-Fa-f]{2})([:-])([0-9A-Fa-f]{2})(?:\2([0-9A-Fa-f]{2})){4}$/);
	if (!match) {
		throw new PortalSessionError('BAD_REQUEST', 'mac must be a valid MAC address', 400);
	}

	// Normalize to uppercase colon-separated.
	const parts = raw
		.replace(/-/g, ':')
		.split(':')
		.map((p) => p.padStart(2, '0').toUpperCase());

	if (parts.length !== 6 || parts.some((p) => !/^[0-9A-F]{2}$/.test(p))) {
		throw new PortalSessionError('BAD_REQUEST', 'mac must be a valid MAC address', 400);
	}

	return parts.join(':');
}

function normalizeIp(ip) {
	if (!hasValue(ip)) {
		throw new PortalSessionError('BAD_REQUEST', 'ip is required', 400);
	}

	const raw = String(ip).trim();
	const ver = net.isIP(raw);
	if (!ver) {
		throw new PortalSessionError('BAD_REQUEST', 'ip must be a valid IP address', 400);
	}
	return raw;
}

function normalizeOptionalText(value) {
	if (!hasValue(value)) return null;
	return String(value).trim();
}

export async function upsertPortalSession({ mac, ip, interface: iface, router_id } = {}, { dbQuery = query } = {}) {
	const macAddress = normalizeMac(mac);
	const ipAddress = normalizeIp(ip);

	const interfaceName = normalizeOptionalText(iface);
	const routerId = normalizeOptionalText(router_id);

	// Idempotent by (mac_address, ip_address): safe to call repeatedly.
	// We also track updated_at for last-seen behavior.
	const res = await dbQuery(
		`
		INSERT INTO portal_sessions (mac_address, ip_address, interface, router_id, created_at, updated_at)
		VALUES ($1, $2::inet, $3, $4, NOW(), NOW())
		ON CONFLICT (mac_address, ip_address)
		DO UPDATE SET
			interface = COALESCE(EXCLUDED.interface, portal_sessions.interface),
			router_id = COALESCE(EXCLUDED.router_id, portal_sessions.router_id),
			updated_at = NOW()
		RETURNING mac_address, ip_address
		`,
		[macAddress, ipAddress, interfaceName, routerId]
	);

	const row = res.rows?.[0];
	return {
		mac: row?.mac_address ?? macAddress,
		ip: String(row?.ip_address ?? ipAddress),
	};
}
