import { upsertPortalSession, PortalSessionError } from '../services/portalSessionService.js';
import net from 'node:net';
import crypto from 'node:crypto';

import { query, pool } from '../config/db.js';
import { VoucherService, toHttpError as toVoucherHttpError } from '../services/voucherService.js';
import {
	activateMobileMoneyAccess,
	activateVoucherAccess,
	getActiveHotspotSessionForMac,
} from '../services/mikrotikRuntimeService.js';
import { mikrotikRuntimeService } from '../services/mikrotikRuntimeService.js';
import { TransactionsService } from '../services/transactionsService.js';
import { toHttpError as toMikroTikRuntimeHttpError } from '../services/mikrotikRuntime/errors.js';
import { MobileMoneyService, toHttpError as toMobileMoneyHttpError } from '../services/mobileMoneyService.js';

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
		const profiles = await mikrotikRuntimeService.listBundles();
		const items = (Array.isArray(profiles) ? profiles : [])
			.map((p) => {
				const name = String(p?.name ?? '').trim();
				if (!name) return null;
				const rateLimit = String(p?.['rate-limit'] ?? p?.rateLimit ?? '').trim() || null;
				return {
					id: name,
					name,
					profile: name,
					rateLimit,
				};
			})
			.filter(Boolean);

		console.log(`[Portal Bundles] fetched ${items.length} bundles from MikroTik`);

		// Public catalog data; short cache to reduce router load.
		res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');

		// Per requirement: success returns a plain array.
		return res.status(200).json(items);
	} catch (err) {
		console.warn('[Portal Bundles] router offline', err?.code ?? '', err?.message ?? err);
		return res.status(503).json({ success: false, error: 'Router offline' });
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
	let client;
	try {
		const mac = req.body?.mac;
		const ip = req.body?.ip;
		const voucherCode = req.body?.voucher_code;

		const session = await requirePortalSession({ mac, ip });

		client = await pool.connect();
		await client.query('BEGIN');

		const redeemed = await VoucherService.redeemVoucherForSessionTransactional(
			client,
			{
				voucher_code: voucherCode,
				mac_address: session.mac,
				ip_address: session.ip,
			},
			{ skipMikrotikProvisioning: true }
		);

		await activateVoucherAccess({
			voucherCode: redeemed.voucher.code,
			bundleId: redeemed.voucher.package.id,
			durationMinutes: redeemed.voucher.package.duration_minutes,
		});

		const tx = await TransactionsService.createVoucherTransactionTransactional(client, {
			voucher_code: redeemed.voucher.code,
			bundle_id: redeemed.voucher.package.id,
			amount_ugx: null,
		});

		await client.query('COMMIT');

		return res.status(200).json({
			success: true,
			data: {
				transaction_reference: tx.reference,
				voucher_code: redeemed.voucher.code,
				expires_at: redeemed.voucher.expires_at ?? null,
				bundle: redeemed.voucher.package,
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
			return res.status(502).json({
				success: false,
				error: err?.message ? `MikroTik error: ${err.message}` : 'MikroTik error',
			});
		}

		if (err instanceof PortalSessionError) {
			return res.status(err.httpStatus).json({
				success: false,
				error: { code: err.code, message: err.message },
			});
		}

		// Map voucher errors to the public portal spec (USED / EXPIRED / INVALID)
		const voucherHttp = toVoucherHttpError(err);
		const voucherErrCode = String(voucherHttp?.body?.error?.code ?? '');
		if (voucherErrCode.startsWith('VOUCHER_') || voucherErrCode === 'BAD_REQUEST') {
			let publicCode = voucherErrCode;
			if (voucherErrCode === 'VOUCHER_USED') publicCode = 'USED';
			else if (voucherErrCode === 'VOUCHER_EXPIRED') publicCode = 'EXPIRED';
			else if (voucherErrCode === 'VOUCHER_NOT_FOUND') publicCode = 'INVALID';

			return res.status(voucherHttp.httpStatus ?? 400).json({
				success: false,
				error: {
					code: publicCode,
					message: voucherHttp?.body?.error?.message ?? 'Voucher error',
				},
			});
		}

		const mtHttp = toMikroTikRuntimeHttpError(err);
		const mtCode = String(mtHttp?.body?.error?.code ?? '');
		if (mtCode && mtCode !== 'INTERNAL_ERROR') {
			return res.status(mtHttp.httpStatus ?? 502).json(mtHttp.body);
		}

		if (err && err.code && err.httpStatus) {
			return res.status(err.httpStatus).json({
				success: false,
				error: { code: err.code, message: err.message ?? 'Error' },
			});
		}

		console.error('[PortalVoucherLogin] unexpected error', {
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

		// Verify router connectivity before doing any voucher work.
		const mt = await mikrotikRuntimeService.health();
		if (mt?.status !== 'online') {
			throw new PortalSessionError('ROUTER_OFFLINE', 'Router offline', 503);
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
			throw new PortalSessionError('SERVER_MISCONFIG', 'Voucher is missing MikroTik profile', 500);
		}

		// Provision the hotspot user on MikroTik. If this fails, DB changes roll back.
		await mikrotikRuntimeService.createVoucher({ code: row.code, profile });
		console.log('[PortalVoucherConnect] hotspot user created', { username: row.code, profile });

		await VoucherService.markVoucherAsUsedTransactional(client, row.id);
		console.log('[PortalVoucherConnect] voucher used', { voucher: row.code });
		await TransactionsService.createVoucherTransactionTransactional(client, {
			voucher_code: row.code,
			bundle_id: row.package_id,
			amount_ugx: null,
		});
		console.log('[PortalVoucherConnect] bundle assigned', { voucher: row.code, bundle_id: row.package_id, profile });

		const durationMinutes = row?.duration_minutes == null ? null : Number(row.duration_minutes);
		const expiresAt =
			durationMinutes != null && Number.isFinite(durationMinutes) && durationMinutes > 0
				? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
				: null;

		await client.query('COMMIT');
		return res.status(200).json({
			success: true,
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
				error: err?.message ? `MikroTik error: ${err.message}` : 'MikroTik error',
			});
		}

		const voucherHttp = toVoucherHttpError(err);
		const voucherErrCode = String(voucherHttp?.body?.error?.code ?? '');
		if (voucherErrCode) {
			if (voucherErrCode === 'VOUCHER_NOT_FOUND') {
				return res.status(404).json({ success: false, error: 'Invalid voucher' });
			}
			if (voucherErrCode === 'VOUCHER_USED') {
				return res.status(409).json({ success: false, error: 'Voucher already used' });
			}
			if (voucherErrCode === 'VOUCHER_EXPIRED') {
				return res.status(410).json({ success: false, error: 'Voucher expired' });
			}
			if (voucherErrCode === 'BAD_REQUEST') {
				return res.status(400).json({
					success: false,
					error: voucherHttp?.body?.error?.message ?? 'Bad request',
				});
			}
		}

		const mtHttp = toMikroTikRuntimeHttpError(err);
		const mtCode = String(mtHttp?.body?.error?.code ?? '');
		if (mtCode && mtCode !== 'INTERNAL_ERROR') {
			// Keep portal spec readable.
			const message = mtHttp?.body?.error?.message ?? 'MikroTik error';
			return res.status(mtHttp.httpStatus ?? 502).json({ success: false, error: message });
		}

		if (err instanceof PortalSessionError) {
			return res.status(err.httpStatus).json({
				success: false,
				error: err.message,
			});
		}

		console.error('[PortalVoucherConnect] unexpected error', {
			message: err?.message ?? String(err),
			code: err?.code ?? null,
		});

		return res.status(500).json({ success: false, error: 'Internal server error' });
	} finally {
		if (client) client.release();
	}
}

export async function postPortalBuyBundleHandler(req, res) {
	let dbClient;
	let createdUsername = null;
	try {
		const phone = normalizePhoneE164ish(req.body?.phone);
		const requestedBundle = normalizeBundleName(req.body?.bundle);

		// Verify router connectivity before provisioning users.
		const mt = await mikrotikRuntimeService.health();
		if (mt?.status !== 'online') {
			throw new PortalSessionError('ROUTER_OFFLINE', 'Router offline', 503);
		}

		// Validate bundle exists on MikroTik (live).
		const profiles = await mikrotikRuntimeService.listBundles();
		const profileRow = (Array.isArray(profiles) ? profiles : []).find(
			(p) => String(p?.name ?? '').trim().toLowerCase() === requestedBundle.toLowerCase()
		);
		if (!profileRow) {
			return res.status(404).json({ success: false, error: 'Invalid bundle' });
		}
		const profileName = String(profileRow?.name ?? '').trim();

		// Generate credentials.
		const username = `U${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
		const password = crypto.randomBytes(5).toString('hex').toUpperCase();
		createdUsername = username;

		// Provision hotspot user on MikroTik.
		await mikrotikRuntimeService.createUser({ username, password, profile: profileName });
		console.log('[PortalBuy] hotspot user created', { username, profile: profileName });

		// Ensure we can log against the packages FK.
		dbClient = await pool.connect();
		await dbClient.query('BEGIN');

		let packageRow = null;
		{
			const r = await dbClient.query(
				'\n\t\t\tSELECT id, name, duration_minutes, mikrotik_profile\n\t\t\tFROM packages\n\t\t\tWHERE mikrotik_profile = $1 OR name = $1\n\t\t\tLIMIT 1\n\t\t\t',
				[profileName]
			);
			packageRow = r.rows?.[0] ?? null;
		}

		if (!packageRow) {
			const durationMinutes = parseDurationMinutesFromProfileName(profileName);
			if (!durationMinutes) {
				throw new PortalSessionError(
					'BUNDLE_NOT_CONFIGURED',
					'Bundle exists on router but is not configured in billing DB (cannot infer duration)',
					409
				);
			}

			const inserted = await dbClient.query(
				`
				INSERT INTO packages (name, duration_minutes, mikrotik_profile)
				VALUES ($1, $2, $3)
				ON CONFLICT (name) DO UPDATE SET mikrotik_profile = EXCLUDED.mikrotik_profile
				RETURNING id, name, duration_minutes, mikrotik_profile
				`,
				[profileName, durationMinutes, profileName]
			);
			packageRow = inserted.rows?.[0] ?? null;
		}

		if (!packageRow?.id) {
			throw new PortalSessionError('INTERNAL_ERROR', 'Failed to resolve bundle package mapping', 500);
		}

		const tx = await TransactionsService.createPendingPortalBuyTransactionTransactional(dbClient, {
			bundle_id: Number(packageRow.id),
			customer_phone: phone,
		});
		console.log('[PortalBuy] transaction pending_payment logged', {
			reference: tx?.reference ?? null,
			phone,
			bundle: profileName,
		});
		console.log('[PortalBuy] bundle assigned', { username, bundle_id: Number(packageRow.id), profile: profileName });

		await dbClient.query('COMMIT');

		return res.status(200).json({
			success: true,
			username,
			password,
		});
	} catch (err) {
		if (dbClient) {
			try {
				await dbClient.query('ROLLBACK');
			} catch {
				// ignore rollback errors
			}
		}

		const mikrotikCode = String(err?.code ?? '');
		if (mikrotikCode.startsWith('MIKROTIK_')) {
			// Best-effort cleanup if we already created a user.
			if (createdUsername) {
				try {
					await mikrotikRuntimeService.removeUser(createdUsername);
				} catch {
					// ignore cleanup errors
				}
			}
			const http = mikrotikCode === 'MIKROTIK_TIMEOUT' ? 504 : 502;
			return res.status(http).json({
				success: false,
				error: err?.message ? `MikroTik error: ${err.message}` : 'MikroTik error',
			});
		}

		if (err instanceof PortalSessionError) {
			return res.status(err.httpStatus).json({ success: false, error: err.message });
		}

		console.error('[PortalBuy] unexpected error', {
			message: err?.message ?? String(err),
			code: err?.code ?? null,
		});

		return res.status(500).json({ success: false, error: 'Internal server error' });
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
