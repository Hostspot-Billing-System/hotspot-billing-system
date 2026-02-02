import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import { query } from '../src/config/db.js';

let schemaReady = false;
let packageId = null;

async function schemaSanityCheck() {
	const res = await query(
		`
		SELECT table_name
		FROM information_schema.tables
		WHERE table_schema = 'public'
			AND table_name IN ('packages', 'vouchers', 'transactions')
		`
	);
	const tables = new Set((res.rows ?? []).map((r) => String(r.table_name)));
	assert.ok(tables.has('packages'), "Missing table 'packages'");
	assert.ok(tables.has('vouchers'), "Missing table 'vouchers'");
	assert.ok(tables.has('transactions'), "Missing table 'transactions'");

	const pkg = await query('SELECT id FROM packages ORDER BY duration_minutes ASC, id ASC LIMIT 1');
	packageId = pkg.rows?.[0]?.id ?? null;
	assert.ok(packageId != null, 'No packages found to attach test vouchers to');
}

async function cleanupByCodes(codes) {
	const list = Array.from(new Set((codes ?? []).filter(Boolean)));
	if (list.length === 0) return;

	try {
		await query('DELETE FROM transactions WHERE voucher_code = ANY($1::text[])', [list]);
	} catch {
		// best-effort
	}
	try {
		await query('DELETE FROM vouchers WHERE code = ANY($1::text[])', [list]);
	} catch {
		// best-effort
	}
}

function assertPortalError(res, { status, code }) {
	assert.equal(res.status, status);
	assert.equal(res.body?.success, false);
	assert.equal(typeof res.body?.error, 'object');
	assert.equal(res.body.error?.code, code);
	assert.equal(typeof res.body.error?.message, 'string');
	assert.ok(res.body.error.message.length > 0);
}

test('DB Sanity Check (portal voucher connect smoke)', async (t) => {
	try {
		await schemaSanityCheck();
		schemaReady = true;
	} catch (err) {
		schemaReady = false;
		const code = err?.code ? String(err.code) : '';
		t.skip(code ? `DB not available (${code})` : 'DB not available');
	}
});

test('POST /api/portal/voucher/connect returns specific errors for invalid/used/expired', async (t) => {
	if (!schemaReady) return t.skip('Schema not ready');

	const invalidCode = `TMP-INVALID-${Date.now()}`;
	const usedCode = `TMP-USED-${Date.now()}`;
	const expiredCode = `TMP-EXPIRED-${Date.now()}`;

	await cleanupByCodes([invalidCode, usedCode, expiredCode]);

	try {
		await query(
			`
			INSERT INTO vouchers (code, package_id, status, expires_at, used_at, created_at)
			VALUES
				($1, $3, 'used', NULL, NOW(), NOW()),
				($2, $3, 'available', NOW() - INTERVAL '1 hour', NULL, NOW() - INTERVAL '2 hours')
			`,
			[usedCode, expiredCode, packageId]
		);

		const invalidRes = await request(app).post('/api/portal/voucher/connect').send({ voucher: invalidCode });
		assertPortalError(invalidRes, { status: 404, code: 'INVALID' });

		const usedRes = await request(app).post('/api/portal/voucher/connect').send({ voucher: usedCode });
		assertPortalError(usedRes, { status: 409, code: 'USED' });

		const expiredRes = await request(app).post('/api/portal/voucher/connect').send({ voucher: expiredCode });
		assertPortalError(expiredRes, { status: 410, code: 'EXPIRED' });
	} finally {
		await cleanupByCodes([invalidCode, usedCode, expiredCode]);
	}
});
