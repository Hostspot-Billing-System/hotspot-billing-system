// Smoke test for captive portal flows (voucher + mobile money callback)
// Runs entirely against the Express app with mocked MikroTik runtime.
// Requires DB env vars (or DATABASE_URL) to be configured.

import crypto from 'node:crypto';
import request from 'supertest';

async function expectStatus(step, reqPromise, expectedStatus) {
	const res = await reqPromise;
	if (res.status !== expectedStatus) {
		// eslint-disable-next-line no-console
		console.error(`STEP FAILED: ${step}`, {
			expectedStatus,
			actualStatus: res.status,
			body: res.body,
			text: res.text,
		});
		throw new Error(`${step} failed (expected ${expectedStatus}, got ${res.status})`);
	}
	return res;
}

function stableStringify(value) {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	const keys = Object.keys(value).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function signCallback({ secret, timestampMs, body }) {
	const payload = stableStringify(body ?? {});
	const signed = `${timestampMs}.${payload}`;
	return crypto.createHmac('sha256', secret).update(signed).digest('hex');
}

function normalizeMacAsUsername(mac) {
	return String(mac ?? '')
		.trim()
		.toUpperCase()
		.replace(/[^0-9A-F]/g, '');
}

async function ensureColumnOrIgnore(pool, sql, params) {
	try {
		await pool.query(sql, params);
	} catch (err) {
		// 42703: undefined_column
		if (String(err?.code) === '42703') return;
		throw err;
	}
}

async function main() {
	// Force mock runtime: no real router needed.
	process.env.MT_MODE = process.env.MT_MODE ?? 'mock';
	process.env.MIKROTIK_MOCK = process.env.MIKROTIK_MOCK ?? 'true';
	process.env.PORTAL_CALLBACK_SECRET = process.env.PORTAL_CALLBACK_SECRET ?? 'dev-portal-callback-secret';

	// Load env + DB/app lazily so the env overrides above take effect.
	await import('../src/config/env.js');
	const { pool } = await import('../src/config/db.js');
	const { default: app } = await import('../src/app.js');
	const { resetMikroTikMockState, getMikroTikMockState } = await import(
		'../src/services/mikrotikMockState.js'
	);

	// Preflight: this flow depends on portal + transactions migrations.
	const txTable = await pool.query("SELECT to_regclass('public.transactions') AS name");
	if (!txTable.rows?.[0]?.name) {
		throw new Error(
			"Missing DB table 'transactions'. Run: `npm run db:apply:transactions` (and ensure schema is applied)"
		);
	}
	const providerEnum = await pool.query(
		"SELECT 1 FROM pg_type WHERE typname = 'payment_provider_enum' LIMIT 1"
	);
	if (!providerEnum.rows?.[0]) {
		throw new Error(
			"Missing DB type 'payment_provider_enum'. Run: `npm run db:apply:transactions` to apply migrations"
		);
	}

	resetMikroTikMockState();
	const mtState = getMikroTikMockState();

	const now = Date.now();
	const mac = 'AA:BB:CC:DD:EE:FF';
	const ip = '192.168.88.10';
	const phone = '256700000001';
	const packageName = `SMOKE_PORTAL_${now}`;
	const voucherCode = `SMOKE-VOUCHER-${now}`;

	let packageId = null;
	let voucherId = null;
	let portalSessionId = null;
	let voucherTransactionReference = null;
	let paymentReference = null;

	try {
		// Seed: create a bundle (package) + voucher.
		const pkgRes = await pool.query(
			`
			INSERT INTO packages (name, duration_minutes, mikrotik_profile)
			VALUES ($1, $2, $3)
			RETURNING id
			`,
			[packageName, 120, 'hotspot_smoke']
		);
		packageId = Number(pkgRes.rows?.[0]?.id);
		if (!packageId) throw new Error('Failed to create smoke package');

		await ensureColumnOrIgnore(
			pool,
			`UPDATE packages SET is_active = TRUE WHERE id = $1`,
			[packageId]
		);
		await ensureColumnOrIgnore(
			pool,
			`UPDATE packages SET price_ugx = 1000 WHERE id = $1`,
			[packageId]
		);

		const vRes = await pool.query(
			`
			INSERT INTO vouchers (code, package_id, status, expires_at)
			VALUES ($1, $2, 'available'::voucher_status, NOW() + INTERVAL '1 hour')
			RETURNING id
			`,
			[voucherCode, packageId]
		);
		voucherId = Number(vRes.rows?.[0]?.id);
		if (!voucherId) throw new Error('Failed to create smoke voucher');

		// 1) Initialize portal context
		{
			const res = await expectStatus(
				'1) portal context',
				request(app).get('/api/portal/context').query({ mac, ip }),
				200
			);

			if (!res.body?.success) throw new Error(`Portal context failed: ${JSON.stringify(res.body)}`);

			const ps = await pool.query(
				`SELECT id FROM portal_sessions WHERE mac_address = $1 AND ip_address = $2::inet LIMIT 1`,
				[mac.toUpperCase(), ip]
			);
			portalSessionId = Number(ps.rows?.[0]?.id ?? null);
			if (!portalSessionId) throw new Error('Portal session not created');
		}

		// 2) Fetch bundles
		{
			const res = await expectStatus('2) bundles', request(app).get('/api/portal/bundles'), 200);
			if (!res.body?.success) throw new Error(`Bundles failed: ${JSON.stringify(res.body)}`);
		}

		// 2.5) Preflight DB ops for voucher-login (helps pinpoint DB constraint issues)
		{
			const { TransactionsService } = await import('../src/services/transactionsService.js');

			const dbClient = await pool.connect();
			try {
				const q = async (step, sql, params) => {
					try {
						return await dbClient.query(sql, params);
					} catch (err) {
						// eslint-disable-next-line no-console
						console.error('Preflight query failed', {
							step,
							sql: String(sql).trim().split(/\s+/).slice(0, 12).join(' '),
							code: err?.code ?? null,
							message: err?.message ?? String(err),
							detail: err?.detail ?? null,
						});
						throw err;
					}
				};

				await q('BEGIN', 'BEGIN');

				// Mirror the voucher redemption SQL in a controlled, step-by-step way.
				const v = await q(
					'voucher select FOR UPDATE',
					`
					SELECT v.id, v.code, v.status, v.expires_at, v.package_id, p.duration_minutes
					FROM vouchers v
					JOIN packages p ON p.id = v.package_id
					WHERE v.code = $1
					FOR UPDATE
					`,
					[voucherCode]
				);
				const voucherRow = v.rows?.[0];
				if (!voucherRow) throw new Error('Preflight: voucher not found');
				if (voucherRow.status !== 'available') {
					throw new Error(`Preflight: expected voucher status available, got ${voucherRow.status}`);
				}

				if (voucherRow.expires_at) {
					await q('expiry check', 'SELECT NOW() < $1::timestamptz AS ok', [voucherRow.expires_at]);
				}

				await q(
					'mark voucher used',
					`UPDATE vouchers SET status = 'used', used_at = NOW() WHERE id = $1 RETURNING id`,
					[voucherRow.id]
				);
				await q(
					'insert hotspot_session',
					`INSERT INTO hotspot_sessions (voucher_id, mac_address, ip_address) VALUES ($1, $2, $3) RETURNING id`,
					[voucherRow.id, mac, ip]
				);

				await TransactionsService.createVoucherTransactionTransactional(dbClient, {
					voucher_code: voucherRow.code,
					bundle_id: voucherRow.package_id,
					amount_ugx: null,
				});

				// Roll back so the actual HTTP flow can redeem for real.
				await q('ROLLBACK', 'ROLLBACK');
			} catch (err) {
				try {
					await dbClient.query('ROLLBACK');
				} catch {
					// ignore
				}
				// eslint-disable-next-line no-console
				console.error('Preflight voucher-login DB ops failed', {
					message: err?.message ?? String(err),
					code: err?.code ?? null,
					detail: err?.detail ?? null,
				});
				throw err;
			} finally {
				dbClient.release();
			}
		}

		// 3) Attempt voucher login (mock success)
		{
			const res = await expectStatus(
				'3) voucher login (first)',
				request(app).post('/api/portal/voucher-login').send({ mac, ip, voucher_code: voucherCode }),
				200
			);

			if (!res.body?.success) throw new Error(`Voucher login failed: ${JSON.stringify(res.body)}`);

			voucherTransactionReference = res.body?.data?.transaction_reference ?? null;
			if (!voucherTransactionReference) throw new Error('Missing transaction_reference from voucher-login');

			// Verify MikroTik runtime provisioning was called (mock user created)
			const created = mtState.usersByName.get(voucherCode);
			if (!created) {
				throw new Error('Expected MikroTik mock to have created a user for voucher code');
			}
		}

		// 4) Attempt voucher login again (expect failure)
		{
			const res = await request(app)
				.post('/api/portal/voucher-login')
				.send({ mac, ip, voucher_code: voucherCode })
				.expect((r) => {
					if (r.status < 400) throw new Error(`Expected failure status, got ${r.status}`);
				});

			if (res.body?.success === true) {
				throw new Error(`Expected voucher login to fail but got success: ${JSON.stringify(res.body)}`);
			}
		}

		// 5) Initiate payment (mock)
		{
			const res = await expectStatus(
				'5) pay initiate',
				request(app).post('/api/portal/pay').send({ mac, ip, phone, bundle_id: packageId }),
				200
			);

			if (!res.body?.success) throw new Error(`Pay initiation failed: ${JSON.stringify(res.body)}`);
			paymentReference = res.body?.data?.reference ?? null;
			if (!paymentReference) throw new Error('Missing payment reference from /pay');
		}

		// 6) Simulate payment callback
		{
			const body = {
				reference: paymentReference,
				status: 'success',
				provider: 'MTN',
				amount_ugx: 1000,
			};

			const timestamp = Date.now();
			const secret = String(process.env.PORTAL_CALLBACK_SECRET);
			const signature = signCallback({ secret, timestampMs: timestamp, body });

			const res = await expectStatus(
				'6) payment callback',
				request(app)
					.post('/api/portal/payment-callback')
					.set('x-timestamp', String(timestamp))
					.set('x-signature', signature)
					.send(body),
				200
			);

			if (!res.body?.success) throw new Error(`Callback failed: ${JSON.stringify(res.body)}`);
		}

		// 7) Verify MikroTik runtime activation is called
		{
			const username = normalizeMacAsUsername(mac);
			const u = mtState.usersByName.get(username);
			if (!u) throw new Error('Expected MikroTik mock to have created a user for the MAC after payment callback');

			const expectedProfile = `hotspot_${packageId}`;
			if (u.profile !== expectedProfile) {
				throw new Error(`Expected profile ${expectedProfile}, got ${u.profile}`);
			}
		}

		// eslint-disable-next-line no-console
		console.log('SMOKE PORTAL FLOW: OK', {
			packageId,
			voucherCode,
			paymentReference,
		});
	} finally {
		// Cleanup (best-effort)
		try {
			if (voucherId) await pool.query('DELETE FROM hotspot_sessions WHERE voucher_id = $1', [voucherId]);
		} catch {
			// ignore
		}
		try {
			if (voucherTransactionReference) {
				await pool.query('DELETE FROM transactions WHERE reference = $1', [voucherTransactionReference]);
			}
		} catch {
			// ignore
		}
		try {
			if (paymentReference) await pool.query('DELETE FROM transactions WHERE reference = $1', [paymentReference]);
		} catch {
			// ignore
		}
		try {
			await pool.query('DELETE FROM portal_sessions WHERE mac_address = $1 AND ip_address = $2::inet', [
				mac.toUpperCase(),
				ip,
			]);
		} catch {
			// ignore
		}
		try {
			if (voucherId) await pool.query('DELETE FROM vouchers WHERE id = $1', [voucherId]);
		} catch {
			// ignore
		}
		try {
			if (packageId) await pool.query('DELETE FROM packages WHERE id = $1', [packageId]);
		} catch {
			// ignore
		}

		try {
			await pool.end();
		} catch {
			// ignore
		}
	}
}

main().catch((err) => {
	// eslint-disable-next-line no-console
	console.error('SMOKE PORTAL FLOW FAILED:', err?.message ?? err);
	// eslint-disable-next-line no-console
	if (err?.code) console.error('code:', err.code);
	process.exit(1);
});
