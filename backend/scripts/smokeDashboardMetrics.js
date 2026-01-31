import app from '../src/app.js';
import '../src/config/env.js';
import { checkDbConnection, pool } from '../src/config/db.js';

async function requestJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

async function getDbTodayStartKampala() {
  const res = await pool.query(
    `
    SELECT (date_trunc('day', timezone('Africa/Kampala', now())) AT TIME ZONE 'Africa/Kampala') AS ts
    `
  );
  return res.rows?.[0]?.ts;
}

async function getDbTruthMetrics() {
  const res = await pool.query(
    `
    WITH today_start AS (
      SELECT (date_trunc('day', timezone('Africa/Kampala', now())) AT TIME ZONE 'Africa/Kampala') AS ts
    )
    SELECT
      (
        SELECT COALESCE(SUM(le.amount_ugx), 0)::numeric(14,2)
        FROM ledger_entries le
        WHERE le.direction = 'credit'
          AND le.source_type = 'transaction'
          AND le.created_at >= (SELECT ts FROM today_start)
      ) AS today_revenue_ugx,

      (
        SELECT COUNT(*)::int
        FROM vouchers v
        WHERE v.status = 'available'
      ) AS voucher_stock_available,

      (
        SELECT COALESCE(SUM(COALESCE(w.net_amount, w.requested_amount, w.total_amount)), 0)::numeric(14,2)
        FROM withdrawals w
        WHERE w.status = 'completed'
      ) AS total_withdrawals_ugx,

      (
        SELECT COUNT(*)::int
        FROM transactions t
        WHERE t.status = 'failed'
          AND t.created_at >= (SELECT ts FROM today_start)
      ) AS failed_transactions_today
    `
  );

  const row = res.rows?.[0] ?? {};
  return {
    today_revenue_ugx: String(row.today_revenue_ugx ?? '0.00'),
    voucher_stock_available: Number(row.voucher_stock_available ?? 0),
    total_withdrawals_ugx: String(row.total_withdrawals_ugx ?? '0.00'),
    failed_transactions_today: Number(row.failed_transactions_today ?? 0),
  };
}

async function fetchMetrics(base) {
  const res = await requestJson(`${base}/api/admin/dashboard/metrics`);
  assert(res.status === 200, `Expected 200 from metrics, got ${res.status}`);
  return res.json;
}

async function main() {
  await checkDbConnection();

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s));
    s.on('error', reject);
  });

  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const created = {
    packageId: null,
    voucherIds: [],
    transactionIds: [],
    withdrawalIds: [],
    ledgerEntryIds: [],
  };

  const now = Date.now();

  try {
    const todayStart = await getDbTodayStartKampala();
    assert(todayStart, 'Expected today_start timestamp');

    // Create a package (bundle)
    const pkgRes = await pool.query(
      `
      INSERT INTO packages (name, duration_minutes, mikrotik_profile)
      VALUES ($1, 60, $2)
      RETURNING id
      `,
      [`SMOKE-DASH-${now}`, `smoke-dash-${now}`]
    );
    created.packageId = Number(pkgRes.rows?.[0]?.id);
    assert(created.packageId, 'Expected packageId');

    // Baseline DB truth and API
    const baseTruth = await getDbTruthMetrics();
    const baseApi = await fetchMetrics(base);

    // Ensure baseline aligns with DB truth
    assert(money2(baseApi.today_revenue_ugx) === money2(baseTruth.today_revenue_ugx), 'Baseline today_revenue mismatch');
    assert(
      Number(baseApi.voucher_stock_available) === Number(baseTruth.voucher_stock_available),
      'Baseline voucher_stock mismatch'
    );
    assert(
      money2(baseApi.total_withdrawals_ugx) === money2(baseTruth.total_withdrawals_ugx),
      'Baseline total_withdrawals mismatch'
    );
    assert(
      Number(baseApi.failed_transactions_today) === Number(baseTruth.failed_transactions_today),
      'Baseline failed_transactions_today mismatch'
    );

    // 1) Create fake completed transaction -> revenue increases (ledger credit)
    const txAmount = 10000;
    const txRes = await requestJson(`${base}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bundle_id: created.packageId,
        customer_phone: '256700000999',
        amount_ugx: txAmount,
        payment_method: 'mobile_money',
        client_id: 910000 + (now % 100000),
      }),
    });
    assert(txRes.status === 201, `Expected 201 from POST /api/transactions, got ${txRes.status}`);
    const txId = Number(txRes.json?.data?.id);
    assert(Number.isFinite(txId) && txId > 0, 'Expected created transaction id');
    created.transactionIds.push(txId);

    // Track the ledger entry inserted for this transaction so cleanup is precise.
    const ledgerRes = await pool.query(
      `
      SELECT id
      FROM ledger_entries
      WHERE source_type = 'transaction'
        AND source_id = $1
      `,
      [txId]
    );
    for (const r of ledgerRes.rows ?? []) {
      const id = Number(r.id);
      if (Number.isFinite(id)) created.ledgerEntryIds.push(id);
    }

    const truthAfterTx = await getDbTruthMetrics();
    const apiAfterTx = await fetchMetrics(base);
    assert(
      money2(apiAfterTx.today_revenue_ugx) === money2(truthAfterTx.today_revenue_ugx),
      'After tx: today_revenue mismatch'
    );
    assert(
      toNumber(truthAfterTx.today_revenue_ugx) >= toNumber(baseTruth.today_revenue_ugx),
      'After tx: expected revenue to not decrease'
    );

    // 2) Create failed transaction -> failed_today increments
    // Ensure created_at is today (Kampala day) by setting it to NOW() at DB.
    const failedRef = `SMOKE-DASH-FAILED-${now}`;
    const failedAmount = 7777;

    const failedIns = await pool.query(
      `
      INSERT INTO transactions (
        reference,
        voucher_code,
        bundle_id,
        customer_phone,
        amount_ugx,
        commission_ugx,
        status,
        payment_method,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        NULL,
        $2,
        $3,
        $4::numeric(12,2),
        ROUND(($4::numeric(12,2) * 0.06), 2),
        'failed',
        $5,
        NOW(),
        NOW()
      )
      RETURNING id
      `,
      [failedRef, created.packageId, '256700000998', money2(failedAmount), 'mobile_money']
    );
    const failedId = Number(failedIns.rows?.[0]?.id);
    assert(Number.isFinite(failedId) && failedId > 0, 'Expected failed transaction id');
    created.transactionIds.push(failedId);

    const truthAfterFailed = await getDbTruthMetrics();
    const apiAfterFailed = await fetchMetrics(base);
    assert(
      Number(apiAfterFailed.failed_transactions_today) === Number(truthAfterFailed.failed_transactions_today),
      'After failed tx: failed_transactions_today mismatch'
    );
    assert(
      Number(truthAfterFailed.failed_transactions_today) >= Number(baseTruth.failed_transactions_today),
      'After failed tx: expected failed_today to not decrease'
    );

    // 3) Create completed withdrawal -> total_withdrawals updates
    const wdRef = `SMOKE-DASH-WD-${now}`;
    const wdNet = 940.0;
    const wdCommission = 60.0;
    const wdTotal = wdNet + wdCommission;

    const wdIns = await pool.query(
      `
      INSERT INTO withdrawals (
        reference,
        client_id,
        total_amount,
        commission_amount,
        net_amount,
        status,
        payout_method,
        payout_account,
        requested_at,
        approved_at,
        completed_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3::numeric(12,2),
        $4::numeric(12,2),
        $5::numeric(12,2),
        'completed',
        'mobile_money',
        '256700000997',
        NOW(),
        NOW(),
        NOW(),
        NOW(),
        NOW()
      )
      RETURNING id
      `,
      [wdRef, 910001 + (now % 100000), money2(wdTotal), money2(wdCommission), money2(wdNet)]
    );
    const wdId = Number(wdIns.rows?.[0]?.id);
    assert(Number.isFinite(wdId) && wdId > 0, 'Expected withdrawal id');
    created.withdrawalIds.push(wdId);

    const truthAfterWd = await getDbTruthMetrics();
    const apiAfterWd = await fetchMetrics(base);
    assert(
      money2(apiAfterWd.total_withdrawals_ugx) === money2(truthAfterWd.total_withdrawals_ugx),
      'After withdrawal: total_withdrawals mismatch'
    );
    assert(
      toNumber(truthAfterWd.total_withdrawals_ugx) >= toNumber(baseTruth.total_withdrawals_ugx),
      'After withdrawal: expected total_withdrawals to not decrease'
    );

    // 4) Add vouchers -> voucher_stock_available updates
    const voucherCodes = [`SMOKE-DASH-V1-${now}`, `SMOKE-DASH-V2-${now}`, `SMOKE-DASH-V3-${now}`];
    for (const code of voucherCodes) {
      const vRes = await pool.query(
        `
        INSERT INTO vouchers (code, package_id, status, expires_at)
        VALUES ($1, $2, 'available'::voucher_status, NOW() + INTERVAL '1 hour')
        RETURNING id
        `,
        [code, created.packageId]
      );
      const vId = Number(vRes.rows?.[0]?.id);
      assert(Number.isFinite(vId) && vId > 0, 'Expected voucher id');
      created.voucherIds.push(vId);
    }

    const truthAfterV = await getDbTruthMetrics();
    const apiAfterV = await fetchMetrics(base);
    assert(
      Number(apiAfterV.voucher_stock_available) === Number(truthAfterV.voucher_stock_available),
      'After vouchers: voucher_stock_available mismatch'
    );

    // Final: ensure ALL fields match DB truth
    assert(money2(apiAfterV.today_revenue_ugx) === money2(truthAfterV.today_revenue_ugx), 'Final today_revenue mismatch');
    assert(
      money2(apiAfterV.total_withdrawals_ugx) === money2(truthAfterV.total_withdrawals_ugx),
      'Final total_withdrawals mismatch'
    );
    assert(
      Number(apiAfterV.failed_transactions_today) === Number(truthAfterV.failed_transactions_today),
      'Final failed_today mismatch'
    );
    assert(
      Number(apiAfterV.voucher_stock_available) === Number(truthAfterV.voucher_stock_available),
      'Final voucher_stock mismatch'
    );

    // eslint-disable-next-line no-console
    console.log('[OK] smoke dashboard metrics passed', {
      todayStart,
      baseline: baseTruth,
      final: truthAfterV,
    });
  } finally {
    // Cleanup (safe to re-run)
    try {
      if (created.voucherIds.length) {
        await pool.query('DELETE FROM vouchers WHERE id = ANY($1::bigint[])', [created.voucherIds]);
      }

      if (created.withdrawalIds.length) {
        await pool.query('DELETE FROM withdrawals WHERE id = ANY($1::bigint[])', [created.withdrawalIds]);
      }

      if (created.ledgerEntryIds.length) {
        await pool.query('DELETE FROM ledger_entries WHERE id = ANY($1::bigint[])', [created.ledgerEntryIds]);
      }

      if (created.transactionIds.length) {
        await pool.query('DELETE FROM transactions WHERE id = ANY($1::bigint[])', [created.transactionIds]);
      }

      if (created.packageId) {
        await pool.query('DELETE FROM packages WHERE id = $1', [created.packageId]);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[WARN] cleanup failed:', e?.message ?? e);
    }

    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Smoke dashboard metrics failed:', err?.message ?? err);
  process.exit(1);
});
