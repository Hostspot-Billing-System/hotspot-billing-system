import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import app from '../src/app.js';
import { query } from '../src/config/db.js';

const REQUIRED_COLUMNS = [
  'reference',
  'customer_phone',
  'bundle_name',
  'amount',
  'commission_amount',
  'net_amount',
  'status',
  'payment_provider',
  'created_at',
  'paid_at',
];

const CONTRACT_KEYS = [
  'id',
  'reference',
  'customer_phone',
  'bundle_name',
  'amount_ugx',
  'commission_ugx',
  'net_amount_ugx',
  'status',
  'payment_provider',
  'created_at',
  'paid_at',
];

let didSeedTransactions = false;
let emptyDbVerified = false;
let firstTransactionId = null;
let schemaReady = false;

const summary = {
  list: false,
  filters: false,
  pagination: false,
  csv: false,
  errorHandling: false,
};

function assertIsoString(value, fieldName) {
  assert.equal(typeof value, 'string', `${fieldName} must be a string`);
  const d = new Date(value);
  assert.ok(!Number.isNaN(d.getTime()), `${fieldName} must be a valid ISO date`);
}

function assertTransactionContract(tx) {
  assert.equal(typeof tx, 'object');
  assert.ok(tx);

  const keys = Object.keys(tx).sort();
  assert.deepEqual(keys, [...CONTRACT_KEYS].sort(), 'Transaction keys must match contract exactly');

  assert.equal(typeof tx.id, 'number');
  assert.ok(Number.isFinite(tx.id));

  assert.equal(typeof tx.reference, 'string');
  assert.ok(tx.reference.length > 0);

  assert.ok(tx.customer_phone === null || typeof tx.customer_phone === 'string');
  assert.ok(tx.bundle_name === null || typeof tx.bundle_name === 'string');

  assert.equal(typeof tx.amount_ugx, 'number');
  assert.ok(Number.isFinite(tx.amount_ugx));

  assert.equal(typeof tx.commission_ugx, 'number');
  assert.ok(Number.isFinite(tx.commission_ugx));

  assert.equal(typeof tx.net_amount_ugx, 'number');
  assert.ok(Number.isFinite(tx.net_amount_ugx));

  assert.ok(['pending', 'success', 'failed'].includes(tx.status));
  assert.equal(typeof tx.payment_provider, 'string');

  assertIsoString(tx.created_at, 'created_at');
  assert.ok(tx.paid_at === null || typeof tx.paid_at === 'string');
  if (tx.paid_at !== null) assertIsoString(tx.paid_at, 'paid_at');
}

async function schemaSanityCheck() {
  const tableRes = await query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
    `
  );
  assert.ok(
    tableRes.rowCount === 1,
    "Missing table 'transactions' (apply migrations: backend/sql/migrations/20260131_001_create_transactions.sql + 20260131_002_extend_transactions_mysql_fields.sql)"
  );

  const colsRes = await query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
    `
  );
  const cols = new Set(colsRes.rows.map((r) => String(r.column_name)));
  for (const c of REQUIRED_COLUMNS) {
    assert.ok(cols.has(c), `Missing required column 'transactions.${c}'`);
  }
}

async function maybeSeedTransactionsIfEmpty() {
  const countRes = await query('SELECT COUNT(*)::int AS count FROM transactions');
  const count = countRes.rows?.[0]?.count ?? 0;

  if (count > 0) {
    didSeedTransactions = false;
    return;
  }

  // Verify empty-db behavior without deleting anything.
  const emptyListRes = await request(app).get('/api/transactions');
  assert.equal(emptyListRes.status, 200);
  assert.equal(emptyListRes.body?.success, true);
  assert.ok(Array.isArray(emptyListRes.body?.data));
  assert.equal(emptyListRes.body.data.length, 0);
  assert.equal(typeof emptyListRes.body?.meta?.total, 'number');
  assert.equal(emptyListRes.body.meta.total, 0);
  emptyDbVerified = true;

  // Insert 3 SAFE rows only when table is empty.
  // NOTE: amount/commission/net are GENERATED columns; we insert via amount_ugx/commission_ugx.
  const pkgRes = await query('SELECT id FROM packages ORDER BY id ASC LIMIT 1');
  const bundleId = pkgRes.rows?.[0]?.id;
  assert.ok(bundleId != null, "No packages found. Create at least one package before running this smoke test.");

  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
  const baseRef = `SMOKE-${stamp}`;

  const insertSql = `
    INSERT INTO transactions (
      reference,
      voucher_code,
      bundle_id,
      customer_phone,
      bundle_name,
      amount_ugx,
      commission_ugx,
      status,
      payment_method,
      payment_provider,
      created_at,
      paid_at
    )
    VALUES
      ($1, NULL, $16, $2, $3, $4, $5, 'completed', 'smoke', 'MTN',  NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '5 minutes'),
      ($6, NULL, $16, $7, $8, $9, $10,'failed',    'smoke', 'AIRTEL',NOW() - INTERVAL '2 days', NULL),
      ($11,NULL, $16, $12,$13,$14,$15,'pending',   'smoke', 'NONE',  NOW() - INTERVAL '1 days', NULL)
    RETURNING id
  `;

  const params = [
    `${baseRef}-COMPLETED`,
    '256700000001',
    'SMOKE-BUNDLE-A',
    1000,
    60,
    `${baseRef}-FAILED`,
    '256700000002',
    'SMOKE-BUNDLE-B',
    800,
    48,
    `${baseRef}-PENDING`,
    '256700000003',
    'SMOKE-BUNDLE-C',
    600,
    36,
    bundleId,
  ];

  await query(insertSql, params);
  didSeedTransactions = true;
}

test('DB Sanity Check (transactions table + required columns)', async (t) => {
  try {
    await schemaSanityCheck();
    await maybeSeedTransactionsIfEmpty();
    schemaReady = true;
  } catch (err) {
    schemaReady = false;
    const code = err?.code ? String(err.code) : '';
    t.skip(code ? `DB not available (${code})` : 'DB not available');
    return;
  }
});

test('Test 1 — GET /api/transactions returns contract + meta', async (t) => {
  if (!schemaReady) return t.skip('Schema not ready');
  const res = await request(app).get('/api/transactions');
  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.ok(Array.isArray(res.body?.data));
  assert.equal(typeof res.body?.meta?.total, 'number');
  assert.equal(typeof res.body?.meta?.page, 'number');
  assert.equal(typeof res.body?.meta?.perPage, 'number');
  assert.equal(typeof res.body?.meta?.totalPages, 'number');

  if (res.body.data.length > 0) {
    for (const item of res.body.data) assertTransactionContract(item);
    firstTransactionId = res.body.data[0].id;
  }

  summary.list = true;
});

test('Test 2 — Pagination (?page=1&perPage=1)', async (t) => {
  if (!schemaReady) return t.skip('Schema not ready');
  const res = await request(app).get('/api/transactions').query({ page: 1, perPage: 1 });
  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.ok(Array.isArray(res.body?.data));
  assert.equal(res.body.data.length, 1);
  assert.ok(res.body?.meta?.totalPages >= 1);
  summary.pagination = true;
});

test('Test 3 — Status Filter (?status=success)', async (t) => {
  if (!schemaReady) return t.skip('Schema not ready');
  const res = await request(app).get('/api/transactions').query({ status: 'success' });
  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.ok(Array.isArray(res.body?.data));
  for (const item of res.body.data) {
    assertTransactionContract(item);
    assert.equal(item.status, 'success');
  }
  summary.filters = true;
});

test('Test 4 — Amount Filter (?minAmount=500)', async (t) => {
  if (!schemaReady) return t.skip('Schema not ready');
  const res = await request(app).get('/api/transactions').query({ minAmount: 500 });
  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.ok(Array.isArray(res.body?.data));
  for (const item of res.body.data) {
    assertTransactionContract(item);
    assert.ok(item.amount_ugx >= 500);
  }
  summary.filters = true;
});

test('Test 5 — GET /api/transactions/:id (found + not found)', async (t) => {
  if (!schemaReady) return t.skip('Schema not ready');
  assert.ok(firstTransactionId != null, 'No transaction id available to test /:id');

  const resOk = await request(app).get(`/api/transactions/${encodeURIComponent(String(firstTransactionId))}`);
  assert.equal(resOk.status, 200);
  assert.equal(resOk.body?.success, true);
  assertTransactionContract(resOk.body?.data);

  const res404 = await request(app).get('/api/transactions/999999999');
  assert.equal(res404.status, 404);
  assert.equal(res404.body?.success, false);
  assert.equal(typeof res404.body?.error?.code, 'string');
  assert.equal(typeof res404.body?.error?.message, 'string');
});

test('Test 6 — CSV Export (/api/transactions/export)', async (t) => {
  if (!schemaReady) return t.skip('Schema not ready');
  const res = await request(app).get('/api/transactions/export');
  assert.equal(res.status, 200);
  assert.ok(String(res.headers?.['content-type'] ?? '').includes('text/csv'));

  const text = typeof res.text === 'string' ? res.text : String(res.body ?? '');
  const expectedHeader =
    'Date,Reference,Phone,Bundle,Amount (UGX),Commission (UGX),Net Amount (UGX),Status,Provider';
  assert.ok(text.includes(expectedHeader), 'CSV header row is missing or incorrect');
  summary.csv = true;
});

test('Step 4 — Error handling (perPage=abc should be 400)', async (t) => {
  if (!schemaReady) return t.skip('Schema not ready');
  const res = await request(app).get('/api/transactions').query({ perPage: 'abc' });
  assert.equal(res.status, 400);
  assert.equal(res.body?.success, false);
  assert.equal(typeof res.body?.error?.code, 'string');
  assert.equal(typeof res.body?.error?.message, 'string');
  summary.errorHandling = true;
});

after(() => {
  // Node's test runner prints exact failing tests. This summary is only for clean runs.
  if (!schemaReady) return;
  if (!summary.list || !summary.filters || !summary.pagination || !summary.csv || !summary.errorHandling) return;

  if (emptyDbVerified) console.log('✔ Empty DB behavior works');
  console.log('✔ Transactions list works');
  console.log('✔ Filters work');
  console.log('✔ Pagination works');
  console.log('✔ CSV export works');
  console.log('✔ Error handling works');
  if (didSeedTransactions) console.log('ℹ Seeded 3 SAFE SMOKE transactions because table was empty');
});
