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

async function requestText(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  return { status: res.status, text };
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
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
    voucherId: null,
    transactionIds: [],
  };

  const now = Date.now();
  const bundleName = `SMOKE-TXN-BUNDLE-${now}`;
  const voucherCode = `SMOKE-TXN-VOUCHER-${now}`;

  try {
    // 1) Insert fake bundle (packages row)
    const pkgIns = await pool.query(
      `
      INSERT INTO packages (name, duration_minutes, mikrotik_profile)
      VALUES ($1, 60, $2)
      RETURNING id
      `,
      [bundleName, `smoke-${now}`]
    );

    const packageId = pkgIns.rows[0]?.id;
    if (!packageId) throw new Error('Failed to create smoke package');
    created.packageId = packageId;

    // 2) Insert fake voucher
    const vIns = await pool.query(
      `
      INSERT INTO vouchers (code, package_id, status, expires_at)
      VALUES ($1, $2, 'available'::voucher_status, NOW() + INTERVAL '1 hour')
      RETURNING id
      `,
      [voucherCode, packageId]
    );

    const voucherId = vIns.rows[0]?.id;
    if (!voucherId) throw new Error('Failed to create smoke voucher');
    created.voucherId = voucherId;

    // 3) Create a completed transaction (through API -> uses TransactionService)
    const completedRes = await requestJson(`${base}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voucher_code: voucherCode,
        bundle_id: packageId,
        customer_phone: '256700000001',
        amount_ugx: 5000,
        payment_method: 'mobile_money',
      }),
    });

    if (completedRes.status !== 201) {
      throw new Error(`Expected 201 from POST /api/transactions, got ${completedRes.status}`);
    }

    const completedTxnId = completedRes.json?.data?.id;
    if (completedTxnId) created.transactionIds.push(completedTxnId);

    // 4) Create a failed transaction (direct DB insert)
    // Note: current createTransaction endpoint always records status='completed'.
    const failedAmount = money(3000);
    const failedRef = `SMOKE-TXN-FAILED-${now}`;

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
        payment_method
      )
      VALUES (
        $1,
        NULL,
        $2,
        $3,
        $4::numeric(12,2),
        ROUND(($4::numeric(12,2) * 0.06), 2),
        'failed',
        $5
      )
      RETURNING id
      `,
      [failedRef, packageId, '256700000002', failedAmount, 'mobile_money']
    );

    const failedTxnId = failedIns.rows[0]?.id;
    if (failedTxnId) created.transactionIds.push(failedTxnId);

    // 5) Fetch transaction list (filters + pagination)
    const listRes = await requestJson(
      `${base}/api/transactions?bundle_id=${encodeURIComponent(String(packageId))}&page=1&limit=10`
    );

    // 6) Export CSV
    const exportRes = await requestText(
      `${base}/api/transactions/export?bundle_id=${encodeURIComponent(String(packageId))}`
    );

    const exportPreview = exportRes.text
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, 5);

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          created: {
            packageId,
            voucherId,
            completedTransaction: completedRes.json,
            failedTransactionId: failedTxnId ?? null,
          },
          list: listRes,
          export: {
            status: exportRes.status,
            preview: exportPreview,
          },
        },
        null,
        2
      )
    );
  } finally {
    // 7) Cleanup (safe to re-run)
    if (created.transactionIds.length) {
      await pool.query('DELETE FROM transactions WHERE id = ANY($1::bigint[])', [created.transactionIds]);
    }

    if (created.voucherId) {
      await pool.query('DELETE FROM vouchers WHERE id = $1', [created.voucherId]);
    }

    if (created.packageId) {
      await pool.query('DELETE FROM packages WHERE id = $1', [created.packageId]);
    }

    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Smoke transactions failed:', err?.message ?? err);
  process.exit(1);
});
