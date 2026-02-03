import { upsertPortalSession, PortalSessionError } from '../services/portalSessionService.js';
import net from 'node:net';
import crypto from 'node:crypto';

import { query, pool } from '../config/db.js';
import { VoucherService, toHttpError as toVoucherHttpError } from '../services/voucherService.js';
import {
	activateMobileMoneyAccess,
	activateVoucherAccess,
	getActiveHotspotSessionForMac,
	upsertRuntimeHotspotUser,
} from '../services/mikrotikRuntimeService.js';
import { mikrotikRuntimeService } from '../services/mikrotikRuntimeService.js';
import { TransactionsService } from '../services/transactionsService.js';
import { toHttpError as toMikroTikRuntimeHttpError } from '../services/mikrotikRuntime/errors.js';
import { MobileMoneyService, toHttpError as toMobileMoneyHttpError } from '../services/mobileMoneyService.js';
import { env } from '../config/env.js';
import { mockRuntimeService } from '../services/MockRuntimeService.js';

function isMockMode() {
	const mode = String(env.MT_MODE ?? 'real').toLowerCase();
	return Boolean(env.MIKROTIK_MOCK || mode === 'mock');
}

const OFFICIAL_BUNDLES = [
	{ key: '2h', name: '2 Hours', duration_minutes: 120, price_ugx: 500, mikrotik_profile: '2h-unlimited' },
	{ key: '12h', name: '12 Hours', duration_minutes: 720, price_ugx: 1000, mikrotik_profile: '12h-unlimited' },
	{ key: 'daily', name: 'Daily', duration_minutes: 1440, price_ugx: 1500, mikrotik_profile: 'daily-unlimited' },
	{ key: 'weekly', name: 'Weekly', duration_minutes: 10080, price_ugx: 6000, mikrotik_profile: 'weekly-unlimited' },
	{ key: 'monthly', name: 'Monthly', duration_minutes: 43200, price_ugx: 23000, mikrotik_profile: 'monthly-unlimited' },
];

const OFFICIAL_BY_DURATION = new Map(OFFICIAL_BUNDLES.map((b) => [Number(b.duration_minutes), b]));

function normalizePaymentProviderParam(value) {
	const raw = String(value ?? '').trim().toUpperCase();
	if (!raw) return 'MTN';
	if (raw === 'MTN') return 'MTN';
	if (raw === 'AIRTEL') return 'AIRTEL';
	throw new PortalSessionError('BAD_REQUEST', 'payment_provider must be MTN or AIRTEL', 400);
}

function isDeterministicPaymentSuccess({ phone, bundleId, provider }) {
	const input = `${String(phone ?? '').trim()}|${String(bundleId ?? '').trim()}|${String(provider ?? '').trim()}`;
	const digest = crypto.createHash('sha256').update(input).digest();
	// Deterministic ~90% success rate.
	return digest[0] < 230;
}

async function hasPublicTableColumn({ table, column }) {
	const t = String(table ?? '').trim();
	const c = String(column ?? '').trim();
	if (!t || !c) return false;
	const res = await query(
		`
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
		  AND table_name = $1
		  AND column_name = $2
		LIMIT 1
		`,
		[t, c]
	);
	return Boolean(res.rows?.[0]);
}

async function listPortalBundlesFromDb() {
	const hasIsActive = await hasPublicTableColumn({ table: 'packages', column: 'is_active' });
	const hasPriceUgx = await hasPublicTableColumn({ table: 'packages', column: 'price_ugx' });

	const columns = [
		'id::int AS id',
		'name',
		'duration_minutes::int AS duration_minutes',
		'mikrotik_profile',
		hasPriceUgx ? 'price_ugx::int AS price_ugx' : null,
		hasIsActive ? 'is_active' : null,
	]
		.filter(Boolean)
		.join(', ');

	const where = hasIsActive ? 'WHERE is_active = true' : '';
	const res = await query(
		`
		SELECT ${columns}
		FROM packages
		${where}
		ORDER BY duration_minutes ASC, id ASC
		`
	);

	const rows = res.rows ?? [];
	const pickedByDuration = new Map();

	for (const row of rows) {
		const durationMinutes = row.duration_minutes == null ? null : Number(row.duration_minutes);
		const official = OFFICIAL_BY_DURATION.get(Number(durationMinutes));
		if (!official) continue;

		// If price_ugx exists and is set, enforce it matches the canonical price.
		if (hasPriceUgx) {
			const price = row.price_ugx == null ? null : Number(row.price_ugx);
			if (price != null && Number.isFinite(price) && Number(price) !== Number(official.price_ugx)) {
				throw new PortalSessionError('SERVER_MISCONFIG', `Bundle price mismatch for ${official.name}`, 500);
			}
		}

		// Prefer the first row by ORDER BY duration,id.
		if (pickedByDuration.has(Number(durationMinutes))) continue;
		pickedByDuration.set(Number(durationMinutes), {
			id: row.id == null ? null : Number(row.id),
			name: String(row.name ?? '').trim() || official.name,
			profile: row.mikrotik_profile,
			mikrotik_profile: row.mikrotik_profile,
			durationMinutes,
			duration_minutes: durationMinutes,
			price_ugx: Number(official.price_ugx),
		});
	}

	// Return in canonical order, and tolerate partial DB config by returning only what exists.
	// The portal UI will still show what's available instead of erroring.
	return OFFICIAL_BUNDLES.map((b) => pickedByDuration.get(Number(b.duration_minutes)) ?? null).filter(Boolean);
}

function normalizePhoneE164ish(phone) {
	const raw = String(phone ?? '').trim();
	if (!raw) throw new PortalSessionError('BAD_REQUEST', 'phone is required', 400);

	// Accept common UG formats: 07XXXXXXXX, 2567XXXXXXXX, +2567XXXXXXXX.
	const digits = raw.replace(/[^0-9+]/g, '');
	const normalized = digits.startsWith('+') ? digits : digits;
	const asDigits = normalized.startsWith('+') ? normalized.slice(1) : normalized;

	if (!/^[0-9]{10,15}$/.test(asDigits)) {
		throw new PortalSessionError('BAD_REQUEST', 'phone must be a valid MSISDN', 400);
	}

	// Store as digits without plus.
	return asDigits;
}

function stableStringify(value) {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	const keys = Object.keys(value).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function verifyCallbackSignature(req) {
	const secret = String(process.env.PORTAL_CALLBACK_SECRET ?? '').trim();
	if (!secret) {
		throw new PortalSessionError('SERVER_MISCONFIG', 'Callback secret not configured', 500);
	}

	const signature = String(req.headers['x-signature'] ?? '').trim();
	const timestamp = String(req.headers['x-timestamp'] ?? '').trim();
	if (!signature || !timestamp) {
		throw new PortalSessionError('UNAUTHORIZED', 'Missing callback signature', 401);
	}

	// Basic replay window: 5 minutes.
	const ts = Number(timestamp);
	if (!Number.isFinite(ts) || ts <= 0) {
		throw new PortalSessionError('UNAUTHORIZED', 'Invalid timestamp', 401);
	}
	if (Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
		throw new PortalSessionError('UNAUTHORIZED', 'Callback timestamp is too old', 401);
	}

	const payload = stableStringify(req.body ?? {});
	const signed = `${timestamp}.${payload}`;
	const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');

	try {
		const a = Buffer.from(signature, 'hex');
		const b = Buffer.from(expected, 'hex');
		if (a.length !== b.length) return false;
		return crypto.timingSafeEqual(a, b);
	} catch {
		return false;
	}
}

function normalizeCallbackStatus(status) {
	const s = String(status ?? '').trim().toLowerCase();
	if (!s) throw new PortalSessionError('BAD_REQUEST', 'status is required', 400);
	if (s === 'success' || s === 'successful' || s === 'paid' || s === 'completed') return 'success';
	if (s === 'failed' || s === 'fail' || s === 'cancelled' || s === 'canceled') return 'failed';
	throw new PortalSessionError('BAD_REQUEST', `Unsupported status: ${status}`, 400);
}

function normalizeReference(ref) {
	const r = String(ref ?? '').trim();
	if (!r) throw new PortalSessionError('BAD_REQUEST', 'reference is required', 400);
	return r;
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

function addMinutesIso(isoLike, minutes) {
	const base = isoLike ? new Date(isoLike) : null;
	if (!base || Number.isNaN(base.getTime())) return null;
	const mins = Number(minutes);
	if (!Number.isFinite(mins) || mins <= 0) return null;
	return new Date(base.getTime() + mins * 60 * 1000).toISOString();
}

function normalizeBundleName(bundle) {
	const b = String(bundle ?? '').trim();
	if (!b) throw new PortalSessionError('BAD_REQUEST', 'bundle is required', 400);
	return b;
}

function parseDurationMinutesFromProfileName(profileName) {
	const raw = String(profileName ?? '').trim();
	if (!raw) return null;

	// Examples we want to support: 24Hrs, 12Hrs, 7Days, 30d, 2hr, 1h, 90m.
	const s = raw.replace(/\s+/g, '').toLowerCase();
	const m = s.match(/(\d+)(w|week|weeks|d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i);
	if (!m) return null;

	const n = Number(m[1]);
	if (!Number.isFinite(n) || n <= 0) return null;
	const unit = String(m[2]).toLowerCase();

	if (unit === 'w' || unit === 'week' || unit === 'weeks') return n * 7 * 1440;
	if (unit === 'd' || unit === 'day' || unit === 'days') return n * 1440;
	if (unit === 'h' || unit === 'hr' || unit === 'hrs' || unit === 'hour' || unit === 'hours') return n * 60;
	if (unit === 'm' || unit === 'min' || unit === 'mins' || unit === 'minute' || unit === 'minutes') return n;

	return null;
}

async function getLatestPortalMobileMoneyTransactionByMac(macAddress) {
	const res = await query(
		`
		SELECT
			t.status,
			t.paid_at,
			t.created_at,
			t.bundle_id,
			p.duration_minutes
		FROM transactions t
		JOIN portal_sessions ps ON ps.id = t.client_id
		LEFT JOIN packages p ON p.id = t.bundle_id
		WHERE ps.mac_address = $1
			AND (t.payment_method IS NULL OR t.payment_method = 'MOBILE_MONEY')
		ORDER BY t.created_at DESC
		LIMIT 1
		`,
		[macAddress]
	);

	const row = res.rows?.[0];
	if (!row) return null;

	const status = String(row.status ?? '').toLowerCase();
	return {
		status,
		paid_at: row.paid_at ? new Date(row.paid_at).toISOString() : null,
		created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
		bundle_id: row.bundle_id == null ? null : Number(row.bundle_id),
		duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
	};
}

async function requirePortalSession({ mac, ip }) {
	const macAddress = normalizeMac(mac);
	const ipAddress = normalizeIp(ip);

	const res = await query(
		`
		SELECT id, mac_address, ip_address
		FROM portal_sessions
		WHERE mac_address = $1 AND ip_address = $2::inet
		LIMIT 1
		`,
		[macAddress, ipAddress]
	);

	if (!res.rows?.[0]) {
		throw new PortalSessionError(
			'SESSION_NOT_FOUND',
			'Portal session not found. Call /api/portal/context first.',
			404
		);
	}

	return { mac: macAddress, ip: ipAddress, id: Number(res.rows?.[0]?.id) };
}

export async function getPortalContextHandler(req, res) {
	try {
		const mac = req.query?.mac;
		const ip = req.query?.ip;
		const iface = req.query?.interface;
		const routerId = req.query?.router_id;

		const session = await upsertPortalSession({ mac, ip, interface: iface, router_id: routerId });

		return res.status(200).json({
			success: true,
			data: {
				mac: session.mac,
				ip: session.ip,
				payment_methods: ['VOUCHER', 'MOBILE_MONEY'],
				currency: 'UGX',
				support_phone: '07XXXXXXXX',
			},
		});
	} catch (err) {
		if (err instanceof PortalSessionError) {
			return res.status(err.httpStatus).json({
				success: false,
				error: { code: err.code, message: err.message },
			});
		}

		return res.status(500).json({
			success: false,
			error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
		});
	}
}

export async function getPortalBundlesHandler(_req, res) {
	try {
		// Bundles are a pricing/catalog concern. Do NOT depend on router availability.
		const raw = await listPortalBundlesFromDb();
		const bundles = (Array.isArray(raw) ? raw : [])
			.map((b) => {
				const id = b?.id == null ? null : Number(b.id);
				const name = String(b?.name ?? '').trim();
				if (!id || !name) return null;
				const price = b?.price_ugx == null ? 0 : Number(b.price_ugx);
				return {
					id: String(id),
					name,
					price: Number.isFinite(price) ? price : 0,
					currency: 'UGX',
					duration_minutes: b?.duration_minutes == null ? null : Number(b.duration_minutes),
				};
			})
			.filter(Boolean);
		console.log('[PORTAL] Returning bundles (db)', bundles);
		res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
		return res.status(200).json({ success: true, bundles });
	} catch (err) {
		console.warn('[Portal Bundles] failed to load bundles from DB', err?.code ?? '', err?.message ?? err);
		// Fallback: still return canonical bundles so the UI can render.
		const bundles = OFFICIAL_BUNDLES.map((b) => ({
			id: String(b.duration_minutes),
			name: b.name,
			price: b.price_ugx,
			currency: 'UGX',
			duration_minutes: b.duration_minutes,
		}));
		return res.status(200).json({ success: true, bundles });
	}
}

export async function getPortalHealthHandler(_req, res) {
	let db = { ok: false, error: null };
	let mikrotik = { ok: false, status: 'offline', identity: null, mode: 'real', error: null, code: null };

	try {
		await query('SELECT 1 AS ok');
		db = { ok: true, error: null };
	} catch (err) {
		db = { ok: false, error: err?.message ?? String(err) };
	}

	if (isMockMode()) {
		const status = mockRuntimeService.health();
		mikrotik = {
			ok: status?.status === 'online',
			status: status?.status ?? 'offline',
			identity: status?.identity ?? 'mikrotik-mock',
			mode: status?.mode ?? 'mock',
			error: null,
			code: null,
		};
	} else {
		try {
			const status = await mikrotikRuntimeService.health();
			mikrotik = {
				ok: status?.status === 'online',
				status: status?.status ?? 'offline',
				identity: status?.identity ?? null,
				mode: status?.mode ?? 'real',
				error: status?.error ?? null,
				code: status?.code ?? null,
			};
		} catch (err) {
			mikrotik = {
				ok: false,
				status: 'offline',
				identity: null,
				mode: 'real',
				error: err?.message ?? String(err),
				code: err?.code ?? null,
			};
		}
	}

	const ok = Boolean(db.ok && mikrotik.ok);
	return res.status(ok ? 200 : 503).json({
		success: true,
		ok,
		db,
		mikrotik,
	});
}

// Polling endpoint used by the captive portal after payment.
// Read-only and safe to call frequently.
export async function getPortalStatusHandler(req, res) {
	try {
		const mac = req.query?.mac;
		const macAddress = normalizeMac(mac);

		// Default to not connected; MikroTik check is best-effort.
		let mikrotik = { connected: false, expires_at: null };
		try {
			mikrotik = await getActiveHotspotSessionForMac({ mac: macAddress });
		} catch {
			// Ignore MikroTik errors for polling; fall back to DB state.
		}

		const latestTx = await getLatestPortalMobileMoneyTransactionByMac(macAddress);

		let status = 'PENDING';
		let expires_at = null;

		if (mikrotik.connected) {
			status = 'CONNECTED';
			expires_at = mikrotik.expires_at;
		} else if (latestTx) {
			if (latestTx.status === 'completed') {
				status = 'CONNECTED';
				expires_at = addMinutesIso(latestTx.paid_at ?? latestTx.created_at, latestTx.duration_minutes);
			} else if (latestTx.status === 'failed') {
				status = 'FAILED';
			} else {
				status = 'PENDING';
			}
		}

		// Cache extremely briefly; intended for frequent polling.
		res.setHeader('Cache-Control', 'no-store');

		return res.status(200).json({
			success: true,
			data: {
				status,
				expires_at,
			},
		});
	} catch (err) {
		if (err instanceof PortalSessionError) {
			return res.status(err.httpStatus).json({
				success: false,
				error: { code: err.code, message: err.message },
			});
		}

		return res.status(500).json({
			success: false,
			error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
		});
	}
}

export async function postPortalVoucherLoginHandler(req, res) {
	// ⚠️ STABLE CORE — DO NOT MODIFY WITHOUT FULL TEST
	// Voucher login is DB-truth only. No countdown. No transactions. No mobile money.
	let client;
	try {
		const mac = req.body?.mac;
		const ip = req.body?.ip;
		const voucherCode = String(req.body?.voucher_code ?? '').trim();
		if (!voucherCode) {
			return res.status(200).json({ success: false, error: 'Voucher code is required' });
		}

		try {
			await upsertPortalSession({ mac, ip });
		} catch {
			return res.status(200).json({ success: false, error: 'Missing or invalid device context' });
		}

		const session = await requirePortalSession({ mac, ip });

		client = await pool.connect();
		await client.query('BEGIN');

		const voucherResult = await client.query(
			`
			SELECT v.id, v.code, v.status, v.expires_at, v.package_id,
			       p.name AS package_name, p.duration_minutes, p.mikrotik_profile
			FROM vouchers v
			JOIN packages p ON p.id = v.package_id
			WHERE v.code = $1
			FOR UPDATE
			`,
			[voucherCode]
		);

		const row = voucherResult.rows?.[0] ?? null;
		if (!row) {
			await client.query('ROLLBACK');
			return res.status(200).json({ success: false, error: 'Invalid voucher' });
		}

		const status = String(row.status ?? '');
		if (status !== 'available') {
			await client.query('ROLLBACK');
			if (status === 'used') return res.status(200).json({ success: false, error: 'Voucher already used' });
			if (status === 'expired') return res.status(200).json({ success: false, error: 'Voucher expired' });
			return res.status(200).json({ success: false, error: 'Voucher not available' });
		}

		if (row.expires_at) {
			const expiryCheck = await client.query('SELECT NOW() >= $1::timestamptz AS expired', [row.expires_at]);
			if (expiryCheck.rows?.[0]?.expired) {
				await client.query('ROLLBACK');
				return res.status(200).json({ success: false, error: 'Voucher expired' });
			}
		}

		await client.query(
			`
			UPDATE vouchers
			SET status = 'used', used_at = NOW()
			WHERE id = $1
			`,
			[row.id]
		);

		await client.query(
			`
			INSERT INTO hotspot_sessions (voucher_id, mac_address, ip_address)
			VALUES ($1, $2, $3)
			`,
			[row.id, session.mac, session.ip]
		);

		try {
			await activateVoucherAccess({
				voucherCode: row.code,
				bundleId: row.package_id,
				durationMinutes: row.duration_minutes,
			});
		} catch {
			// Never block voucher login due to router/mock issues.
		}

		await client.query('COMMIT');
		return res.status(200).json({
			success: true,
			data: {
				voucher_code: row.code,
				expires_at: row.expires_at ?? null,
				bundle: {
					id: row.package_id,
					name: row.package_name,
					duration_minutes: row.duration_minutes,
					mikrotik_profile: row.mikrotik_profile,
				},
			},
		});
	} catch {
		if (client) {
			try {
				await client.query('ROLLBACK');
			} catch {
				// ignore
			}
		}
		return res.status(200).json({ success: false, error: 'Unable to login with voucher. Please try again.' });
	} finally {
		if (client) client.release();
	}
}

export async function postPortalVoucherConnectHandler(req, res) {
	let client;
	try {
		const voucher = String(req.body?.voucher ?? '').trim();
		if (!voucher) {
			return res.status(400).json({
				success: false,
				error: { code: 'BAD_REQUEST', message: 'voucher is required' },
			});
		}

		// Real mode: verify router connectivity before doing any voucher work.
		if (!isMockMode()) {
			const mt = await mikrotikRuntimeService.health();
			if (mt?.status !== 'online') {
				throw new PortalSessionError('ROUTER_OFFLINE', 'Router offline', 503);
			}
		}

		client = await pool.connect();
		await client.query('BEGIN');

		// Lock voucher row to prevent concurrent reuse.
		const voucherResult = await client.query(
			`
			SELECT
				v.id,
				v.code,
				v.status,
				v.expires_at,
				v.used_at,
				v.created_at,
				v.package_id,
				p.name AS package_name,
				p.duration_minutes,
				p.mikrotik_profile
			FROM vouchers v
			JOIN packages p ON p.id = v.package_id
			WHERE v.code = $1
			FOR UPDATE
			`,
			[voucher]
		);

		const row = voucherResult.rows?.[0] ?? null;
		VoucherService.validateVoucherForLogin(row);

		// Re-check expiry inside the transaction using DB time.
		if (row?.expires_at) {
			const expiryCheck = await client.query('SELECT NOW() >= $1::timestamptz AS expired', [row.expires_at]);
			if (expiryCheck.rows?.[0]?.expired) {
				throw new PortalSessionError('EXPIRED', 'Voucher is expired', 410);
			}
		}

		const profile = String(row?.mikrotik_profile ?? '').trim();
		if (!profile) {
			throw new PortalSessionError('SERVER_MISCONFIG', 'Voucher is not configured', 200);
		}

		if (isMockMode()) {
			// Mock mode: skip router calls; still activate access via runtime mock.
			await activateVoucherAccess({
				voucherCode: row.code,
				bundleId: row.package_id,
				durationMinutes: row.duration_minutes,
			});
			console.log('[PortalVoucherConnect] mock access activated', {
				username: row.code,
				bundle_id: row.package_id,
			});
		} else {
			// Real mode: provision the hotspot user on MikroTik. If this fails, DB changes roll back.
			await mikrotikRuntimeService.createVoucher({ code: row.code, profile });
			console.log('[PortalVoucherConnect] hotspot user created', { username: row.code, profile });
		}

		await VoucherService.markVoucherAsUsedTransactional(client, row.id);
		console.log('[PortalVoucherConnect] voucher used', { voucher: row.code });
		// STRICT RULE: voucher connect is NOT a financial transaction.
		// Do NOT create any rows in `transactions` for voucher-based access.
		console.log('[PortalVoucherConnect] bundle assigned', { voucher: row.code, bundle_id: row.package_id, profile });

		const durationMinutes = row?.duration_minutes == null ? null : Number(row.duration_minutes);
		const expiresAt =
			durationMinutes != null && Number.isFinite(durationMinutes) && durationMinutes > 0
				? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
				: null;

		await client.query('COMMIT');
		return res.status(200).json({
			success: true,
			message: 'Voucher accepted',
			data: {
				durationMinutes: durationMinutes != null && Number.isFinite(durationMinutes) ? durationMinutes : null,
				expiresAt,
			},
		});
	} catch (err) {
		if (client) {
			try {
				await client.query('ROLLBACK');
			} catch {
				// ignore rollback errors
			}
		}

		const mikrotikCode = String(err?.code ?? '');
		if (mikrotikCode.startsWith('MIKROTIK_')) {
			const http = mikrotikCode === 'MIKROTIK_TIMEOUT' ? 504 : 502;
			return res.status(http).json({
				success: false,
				error: {
					code: mikrotikCode || 'MIKROTIK_ERROR',
					message: err?.message ? `MikroTik error: ${err.message}` : 'MikroTik error',
				},
			});
		}

		const voucherHttp = toVoucherHttpError(err);
		const voucherErrCode = String(voucherHttp?.body?.error?.code ?? '');
		if (voucherErrCode) {
			if (voucherErrCode === 'VOUCHER_NOT_FOUND') {
				return res.status(404).json({
					success: false,
					error: { code: 'INVALID', message: 'Invalid voucher' },
				});
			}
			if (voucherErrCode === 'VOUCHER_USED') {
				return res.status(409).json({
					success: false,
					error: { code: 'USED', message: 'Voucher already used' },
				});
			}
			if (voucherErrCode === 'VOUCHER_EXPIRED') {
				return res.status(410).json({
					success: false,
					error: { code: 'EXPIRED', message: 'Voucher expired' },
				});
			}
			if (voucherErrCode === 'BAD_REQUEST') {
				return res.status(400).json({
					success: false,
					error: { code: 'BAD_REQUEST', message: voucherHttp?.body?.error?.message ?? 'Bad request' },
				});
			}
		}

		const mtHttp = toMikroTikRuntimeHttpError(err);
		const mtCode = String(mtHttp?.body?.error?.code ?? '');
		if (mtCode && mtCode !== 'INTERNAL_ERROR') {
			// Keep portal spec readable.
			const message = mtHttp?.body?.error?.message ?? 'MikroTik error';
			return res.status(mtHttp.httpStatus ?? 502).json({
				success: false,
				error: { code: mtCode, message },
			});
		}

		if (err instanceof PortalSessionError) {
			return res.status(err.httpStatus).json({
				success: false,
				error: { code: err.code, message: err.message },
			});
		}

		console.error('[PortalVoucherConnect] unexpected error', {
			message: err?.message ?? String(err),
			code: err?.code ?? null,
		});

		return res.status(200).json({
			success: false,
			error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
		});
	} finally {
		if (client) client.release();
	}
}

export async function postPortalSessionDisconnectHandler(req, res) {
	try {
		if (isMockMode()) {
			const data = await mockRuntimeService.disconnectSession();
			return res.status(200).json({
				success: true,
				message: 'Session disconnected',
				data: data ?? { disconnected: true },
			});
		}

		const usernameRaw = String(req.body?.username ?? '').trim();
		if (usernameRaw) {
			await mikrotikRuntimeService.disconnectUser(usernameRaw);
			return res.status(200).json({
				success: true,
				message: 'Session disconnected',
				data: { disconnected: true },
			});
		}

		const mac = req.body?.mac ?? req.query?.mac;
		const ip = req.body?.ip ?? req.query?.ip;
		const session = await requirePortalSession({ mac, ip });
		const macUser = String(session.mac ?? '')
			.trim()
			.toUpperCase()
			.replace(/[^0-9A-F]/g, '');
		if (!macUser) {
			throw new PortalSessionError('BAD_REQUEST', 'mac is required', 400);
		}

		await mikrotikRuntimeService.disconnectUser(macUser);
		return res.status(200).json({
			success: true,
			message: 'Session disconnected',
			data: { disconnected: true },
		});
	} catch (err) {
		const mtHttp = toMikroTikRuntimeHttpError(err);
		const mtCode = String(mtHttp?.body?.error?.code ?? '');
		if (mtCode && mtCode !== 'INTERNAL_ERROR') {
			const message = mtHttp?.body?.error?.message ?? 'MikroTik error';
			return res.status(mtHttp.httpStatus ?? 502).json({
				success: false,
				error: { code: mtCode, message },
			});
		}

		if (err instanceof PortalSessionError) {
			return res.status(err.httpStatus).json({
				success: false,
				error: { code: err.code, message: err.message },
			});
		}

		return res.status(500).json({
			success: false,
			error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
		});
	}
}

export async function postPortalBuyBundleHandler(req, res) {
	// ⚠️ STABLE CORE — DO NOT MODIFY WITHOUT FULL TEST
	let dbClient;
	try {
		const rawPhone = String(req.body?.phone ?? '').trim();
		if (!rawPhone) {
			return res.status(200).json({ success: false, error: 'Phone number is required' });
		}

		let phone;
		try {
			phone = normalizePhoneE164ish(rawPhone);
		} catch {
			return res.status(200).json({ success: false, error: 'Phone number is invalid' });
		}

		const paymentProvider = normalizePaymentProviderParam(
			req.body?.payment_provider ?? req.body?.provider ?? req.body?.paymentProvider
		);

		const requestedBundle = req.body?.bundle;
		const bundleIdRaw = req.body?.bundle_id ?? req.body?.bundleId;
		if (bundleIdRaw == null || String(bundleIdRaw).trim() === '') {
			return res.status(200).json({ success: false, error: 'Bundle is required' });
		}

		if (!isMockMode()) {
			return res.status(200).json({ success: false, error: 'Payments are not available here right now' });
		}

		const hasIsActive = await hasPublicTableColumn({ table: 'packages', column: 'is_active' });
		const hasPriceUgx = await hasPublicTableColumn({ table: 'packages', column: 'price_ugx' });
		if (!hasPriceUgx) {
			return res.status(200).json({ success: false, error: 'Bundles are not configured for pricing' });
		}

		dbClient = await pool.connect();
		await dbClient.query('BEGIN');

		let packageRow = null;
		if (bundleIdRaw != null && String(bundleIdRaw).trim() !== '') {
			const idNum = Number(String(bundleIdRaw).trim());
			if (!Number.isFinite(idNum) || idNum <= 0) {
				await dbClient.query('ROLLBACK');
				return res.status(200).json({ success: false, error: 'Invalid bundle' });
			}
			const whereActive = hasIsActive ? 'AND is_active = TRUE' : '';
			const resPkg = await dbClient.query(
				`
				SELECT id::int AS id, name, duration_minutes::int AS duration_minutes, mikrotik_profile, price_ugx::int AS price_ugx
				FROM packages
				WHERE id = $1::bigint
				${whereActive}
				LIMIT 1
				`,
				[Math.floor(idNum)]
			);
			packageRow = resPkg.rows?.[0] ?? null;
		} else {
			const wanted = normalizeBundleName(requestedBundle);
			const whereActive = hasIsActive ? 'AND is_active = TRUE' : '';
			const resPkg = await dbClient.query(
				`
				SELECT id::int AS id, name, duration_minutes::int AS duration_minutes, mikrotik_profile, price_ugx::int AS price_ugx
				FROM packages
				WHERE (
					LOWER(name) = LOWER($1)
					OR LOWER(mikrotik_profile) = LOWER($1)
					OR id::text = $1
				)
				${whereActive}
				LIMIT 1
				`,
				[wanted]
			);
			packageRow = resPkg.rows?.[0] ?? null;
		}

		if (!packageRow?.id) {
			await dbClient.query('ROLLBACK');
			return res.status(200).json({ success: false, error: 'Invalid bundle' });
		}

		const durationMinutes = Number(packageRow.duration_minutes ?? 0);
		const official = OFFICIAL_BY_DURATION.get(Number(durationMinutes));
		const priceUgx = packageRow.price_ugx == null ? null : Number(packageRow.price_ugx);
		if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || !official || priceUgx == null || !Number.isFinite(priceUgx)) {
			await dbClient.query('ROLLBACK');
			return res.status(200).json({ success: false, error: 'Bundle is not configured' });
		}
		if (Number(priceUgx) !== Number(official.price_ugx)) {
			await dbClient.query('ROLLBACK');
			return res.status(200).json({ success: false, error: 'Bundle is not configured' });
		}

		const tx = await TransactionsService.createPendingPortalBuyTransactionTransactional(dbClient, {
			bundle_id: Number(packageRow.id),
			customer_phone: phone,
			amount_ugx: Number(priceUgx),
			payment_provider: paymentProvider,
		});

		await new Promise((r) => setTimeout(r, 1000 + Math.floor(Math.random() * 2000)));

		const paymentOk = isDeterministicPaymentSuccess({
			phone,
			bundleId: packageRow.id,
			provider: paymentProvider,
		});
		if (!paymentOk) {
			await TransactionsService.markTransactionFailedTransactional(dbClient, tx.reference, {
				failure_reason: 'PAYMENT_FAILED',
				payment_provider: paymentProvider,
			});
			await dbClient.query('COMMIT');
			dbClient.release();
			dbClient = null;
			return res.status(200).json({ success: false, error: 'Payment failed. Please try again.' });
		}

		const voucherRes = await dbClient.query(
			`
			SELECT id, code
			FROM vouchers
			WHERE package_id = $1
			  AND status = 'available'
			  AND (expires_at IS NULL OR expires_at > NOW())
			ORDER BY id ASC
			FOR UPDATE SKIP LOCKED
			LIMIT 1
			`,
			[Number(packageRow.id)]
		);
		const voucherRow = voucherRes.rows?.[0] ?? null;
		if (!voucherRow?.id || !voucherRow?.code) {
			await TransactionsService.markTransactionFailedTransactional(dbClient, tx.reference, {
				failure_reason: 'NO_VOUCHERS_AVAILABLE',
				payment_provider: paymentProvider,
			});
			await dbClient.query('COMMIT');
			dbClient.release();
			dbClient = null;
			return res.status(200).json({ success: false, error: 'No vouchers available for this bundle' });
		}

		await dbClient.query(
			`
			UPDATE vouchers
			SET status = 'used', used_at = NOW()
			WHERE id = $1
			`,
			[voucherRow.id]
		);

		try {
			await activateVoucherAccess({
				voucherCode: voucherRow.code,
				bundleId: Number(packageRow.id),
				durationMinutes,
			});
		} catch {
			// never crash due to router/mock
		}

		await TransactionsService.markTransactionCompletedTransactional(dbClient, tx.reference, {
			payment_provider: paymentProvider,
		});

		await dbClient.query('COMMIT');
		dbClient.release();
		dbClient = null;

		return res.status(200).json({
			success: true,
			data: {
				transaction_reference: tx.reference,
				voucher_code: voucherRow.code,
				username: voucherRow.code,
				password: '',
			},
		});
	} catch (err) {
		if (dbClient) {
			try {
				await dbClient.query('ROLLBACK');
			} catch {
				// ignore
			}
		}

		const txHttp = TransactionsService.toHttpError?.(err);
		if (txHttp?.body?.success === false) {
			return res.status(200).json({
				success: false,
				error: txHttp?.body?.error?.message || 'Unable to complete purchase. Please try again.',
			});
		}

		return res.status(200).json({ success: false, error: 'Unable to complete purchase. Please try again.' });
	} finally {
		if (dbClient) dbClient.release();
	}
}

export async function postPortalPayHandler(req, res) {
	let client;
	try {
		const mac = req.body?.mac;
		const ip = req.body?.ip;
		const phone = req.body?.phone;
		const bundleId = req.body?.bundle_id;

		const session = await requirePortalSession({ mac, ip });
		const msisdn = normalizePhoneE164ish(phone);
		const paymentProvider = normalizePaymentProviderParam(
			req.body?.payment_provider ?? req.body?.provider ?? req.body?.paymentProvider
		);

		client = await pool.connect();
		await client.query('BEGIN');

		await TransactionsService.lockPortalPaymentForMacTransactional(client, { mac: session.mac });
		await TransactionsService.assertNoPendingPortalPaymentForMacTransactional(client, {
			mac: session.mac,
		});

		const bundle = await TransactionsService.getActiveBundleForPortalPurchaseTransactional(client, {
			bundle_id: bundleId,
		});

		const tx = await TransactionsService.createPendingPortalPaymentTransactionTransactional(client, {
			portal_session_id: session.id,
			mac_address: session.mac,
			bundle_id: bundle.id,
			customer_phone: msisdn,
			amount_ugx: bundle.price_ugx,
			payment_provider: paymentProvider,
		});

		await client.query('COMMIT');

		try {
			await MobileMoneyService.initiatePayment({
				phone: msisdn,
				amount_ugx: bundle.price_ugx,
				reference: tx.reference,
				bundle_id: bundle.id,
				mac: session.mac,
				ip: session.ip,
			});
		} catch (err) {
			// Best-effort mark as failed so user can retry.
			await TransactionsService.markTransactionFailedByReference(tx.reference, {
				failure_reason: err?.message ?? 'Payment initiation failed',
				payment_provider: paymentProvider,
			});

			const mmHttp = toMobileMoneyHttpError(err);
			return res.status(mmHttp.httpStatus ?? 502).json(mmHttp.body);
		}

		return res.status(200).json({
			success: true,
			data: {
				transaction_id: tx.id,
				reference: tx.reference,
				message: 'Payment prompt sent',
			},
		});
	} catch (err) {
		if (client) {
			try {
				await client.query('ROLLBACK');
			} catch {
				// ignore rollback errors
			}
		}

		if (err instanceof PortalSessionError) {
			return res.status(err.httpStatus).json({
				success: false,
				error: { code: err.code, message: err.message },
			});
		}

		const txHttp = TransactionsService.toHttpError?.(err);
		if (txHttp?.body?.error?.code && txHttp.body.error.code !== 'INTERNAL_ERROR') {
			return res.status(txHttp.httpStatus ?? 400).json(txHttp.body);
		}

		console.error('[PortalPay] unexpected error', {
			message: err?.message ?? String(err),
			code: err?.code ?? null,
		});

		return res.status(500).json({
			success: false,
			error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
		});
	} finally {
		if (client) client.release();
	}
}

export async function postPortalPaymentCallbackHandler(req, res) {
	// Log everything (as requested) - keep it structured.
	console.log('[PortalCallback] received', {
		headers: {
			'x-signature': req.headers['x-signature'] ?? null,
			'x-timestamp': req.headers['x-timestamp'] ?? null,
			'user-agent': req.headers['user-agent'] ?? null,
		},
		body: req.body ?? null,
	});

	let client;
	try {
		const ok = verifyCallbackSignature(req);
		if (!ok) {
			console.log('[PortalCallback] invalid signature');
			return res.status(401).json({
				success: false,
				error: { code: 'UNAUTHORIZED', message: 'Invalid signature' },
			});
		}

		const reference = normalizeReference(req.body?.reference ?? req.body?.tx_ref ?? req.body?.transaction_reference);
		const status = normalizeCallbackStatus(req.body?.status);
		const provider = String(req.body?.provider ?? req.body?.payment_provider ?? 'NONE').trim();
		const providerTxId = String(req.body?.provider_tx_id ?? req.body?.provider_ref ?? '').trim() || null;
		const amount = req.body?.amount_ugx ?? req.body?.amount;

		client = await pool.connect();
		await client.query('BEGIN');

		const tx = await TransactionsService.getTransactionByReferenceForUpdateTransactional(client, reference);

		// Idempotency: if already terminal, return success without redoing anything.
		if (tx.status === 'completed') {
			await client.query('COMMIT');
			console.log('[PortalCallback] already completed', { reference });
			return res.status(200).json({ success: true, data: { reference, status: 'completed' } });
		}
		if (tx.status === 'failed') {
			await client.query('COMMIT');
			console.log('[PortalCallback] already failed', { reference });
			return res.status(200).json({ success: true, data: { reference, status: 'failed' } });
		}

		// Optional sanity check: if provider sends amount, it must match what we expect.
		if (amount != null) {
			TransactionsService.assertAmountMatches(tx.amount_ugx, amount);
		}

		if (status === 'failed') {
			await TransactionsService.markTransactionFailedTransactional(client, reference, {
				failure_reason: String(req.body?.failure_reason ?? 'Payment failed').slice(0, 255),
				payment_provider: provider,
				provider_tx_id: providerTxId,
			});
			await client.query('COMMIT');
			console.log('[PortalCallback] marked failed', { reference });
			return res.status(200).json({ success: true, data: { reference, status: 'failed' } });
		}

		// SUCCESS: mark completed and activate access exactly once.
		const portalSession = await TransactionsService.getPortalSessionForTransactionTransactional(client, {
			portal_session_id: tx.client_id,
		});

		await TransactionsService.markTransactionCompletedTransactional(client, reference, {
			payment_provider: provider,
			provider_tx_id: providerTxId,
		});

		const bundle = await TransactionsService.getBundleForActivationTransactional(client, {
			bundle_id: tx.bundle_id,
		});

		await activateMobileMoneyAccess({
			mac: portalSession.mac_address,
			bundleId: tx.bundle_id,
			durationMinutes: bundle.duration_minutes,
		});

		await client.query('COMMIT');
		console.log('[PortalCallback] completed + activated', { reference });
		return res.status(200).json({ success: true, data: { reference, status: 'completed' } });
	} catch (err) {
		if (client) {
			try {
				await client.query('ROLLBACK');
			} catch {
				// ignore rollback errors
			}
		}

		if (err instanceof PortalSessionError) {
			return res.status(err.httpStatus).json({
				success: false,
				error: { code: err.code, message: err.message },
			});
		}

		const txHttp = TransactionsService.toHttpError?.(err);
		if (txHttp?.body?.error?.code && txHttp.body.error.code !== 'INTERNAL_ERROR') {
			return res.status(txHttp.httpStatus ?? 400).json(txHttp.body);
		}

		const mtHttp = toMikroTikRuntimeHttpError(err);
		const mtCode = String(mtHttp?.body?.error?.code ?? '');
		if (mtCode && mtCode !== 'INTERNAL_ERROR') {
			return res.status(mtHttp.httpStatus ?? 502).json(mtHttp.body);
		}

		return res.status(500).json({
			success: false,
			error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
		});
	} finally {
		if (client) client.release();
	}
}
