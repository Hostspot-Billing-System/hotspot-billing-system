import crypto from 'crypto';

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

function logStep(title) {
  // eslint-disable-next-line no-console
  console.log(`\n[SMOKE] ${title}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hashOtp(otp) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .createHash('sha256')
    .update(`${salt}:${String(otp ?? '')}`)
    .digest('hex');
  return `${salt}$${hash}`;
}

async function getOwnerBalance(ownerId) {
  const res = await pool.query(
    `
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN direction = 'credit' THEN amount_ugx
            WHEN direction = 'debit' THEN -amount_ugx
            ELSE 0
          END
        ),
        0
      )::numeric(14,2) AS balance
    FROM ledger_entries
    WHERE owner_id = $1
    `,
    [ownerId]
  );

  const balance = res.rows?.[0]?.balance;
  return balance == null ? '0.00' : String(balance);
}

async function applyMigration(relativePath) {
  const fs = await import('fs/promises');
  const path = await import('path');
  const { fileURLToPath } = await import('url');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const fullPath = path.resolve(__dirname, relativePath);
  const sql = await fs.readFile(fullPath, 'utf8');
  try {
    await pool.query(sql);
  } catch (e) {
    // Allow re-running the smoke script against an already-migrated database.
    // 42710: duplicate_object, 42P07: duplicate_table (also used for some relations)
    if (e?.code === '42710' || e?.code === '42P07') return;
    if (String(e?.message ?? '').toLowerCase().includes('already exists')) return;
    throw e;
  }
}

function newIdempotencyKey() {
  return `SMOKE-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
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
    packageIds: [],
    voucherIds: [],
    transactionIds: [],
    withdrawalIds: [],
  };

  const ownerId = 910000 + (Date.now() % 100000);
  const now = Date.now();

  try {
    logStep('0) Ensure migrations exist (ledger + idempotency + otp tracking)');
    await applyMigration('../sql/migrations/20260131_007_create_ledger_entries.sql');
    await applyMigration('../sql/migrations/20260131_008_add_withdrawals_idempotency_key.sql');
    await applyMigration('../sql/migrations/20260131_009_add_withdrawals_otp_attempt_tracking.sql');

    logStep('1) Create completed transaction -> ledger credit');

    const pkgRes = await pool.query(
      `
      INSERT INTO packages (name, duration_minutes, mikrotik_profile)
      VALUES ($1, 60, $2)
      RETURNING id
      `,
      [`SMOKE-FIN-${now}`, `smoke-fin-${now}`]
    );
    const packageId = Number(pkgRes.rows[0].id);
    created.packageIds.push(packageId);

    const voucherCode = `SMOKE-FIN-VOUCHER-${now}`;
    const vRes = await pool.query(
      `
      INSERT INTO vouchers (code, package_id, status, expires_at)
      VALUES ($1, $2, 'available'::voucher_status, NOW() + INTERVAL '1 hour')
      RETURNING id
      `,
      [voucherCode, packageId]
    );
    const voucherId = Number(vRes.rows[0].id);
    created.voucherIds.push(voucherId);

    const txAmount = 10000;
    const txRes = await requestJson(`${base}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voucher_code: voucherCode,
        bundle_id: packageId,
        customer_phone: '256700000001',
        amount_ugx: txAmount,
        payment_method: 'mobile_money',
        client_id: ownerId,
      }),
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(txRes, null, 2));
    assert(txRes.status === 201, `Expected 201 from POST /api/transactions, got ${txRes.status}`);
    const txId = Number(txRes.json?.data?.id);
    assert(Number.isFinite(txId) && txId > 0, 'Expected transaction id');
    created.transactionIds.push(txId);

    const ledgerTxRes = await pool.query(
      `
      SELECT id, owner_id, source_type, source_id, direction, amount_ugx, balance_after
      FROM ledger_entries
      WHERE owner_id = $1
        AND source_type = 'transaction'
        AND source_id = $2
      LIMIT 1
      `,
      [ownerId, txId]
    );
    const ledgerTx = ledgerTxRes.rows?.[0] ?? null;
    assert(ledgerTx, 'Expected ledger credit for completed transaction');
    assert(String(ledgerTx.direction) === 'credit', `Expected credit direction, got ${ledgerTx.direction}`);

    logStep('2) Verify balance increased correctly');
    const balanceAfterTx = await getOwnerBalance(ownerId);
    // Net credit is amount - 6% commission.
    const expectedNetCredit = (txAmount - Math.round(txAmount * 0.06 * 100) / 100).toFixed(2);
    assert(balanceAfterTx === expectedNetCredit, `Expected balance ${expectedNetCredit}, got ${balanceAfterTx}`);

    logStep('3) Start two withdrawals in parallel');
    const requestBody = {
      owner_id: ownerId,
      amount: 8000,
      payout_phone: '0772123456',
    };

    const idem1 = newIdempotencyKey();
    const idem2 = newIdempotencyKey();

    const [w1, w2] = await Promise.all([
      requestJson(`${base}/api/withdrawals/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem1 },
        body: JSON.stringify(requestBody),
      }),
      requestJson(`${base}/api/withdrawals/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem2 },
        body: JSON.stringify(requestBody),
      }),
    ]);

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ w1, w2 }, null, 2));

    const success = [w1, w2].find((r) => r.status === 201);
    const failure = [w1, w2].find((r) => r.status !== 201);
    assert(success, 'Expected one withdrawal request to succeed');
    assert(failure, 'Expected one withdrawal request to fail');

    const withdrawalId = Number(success.json?.data?.withdrawal_id);
    assert(Number.isFinite(withdrawalId) && withdrawalId > 0, 'Expected withdrawal_id');
    created.withdrawalIds.push(withdrawalId);

    logStep('4) Retry withdrawal request with same idempotency key -> returns same result');
    const retryRes = await requestJson(`${base}/api/withdrawals/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem1 },
      body: JSON.stringify(requestBody),
    });
    assert(retryRes.status === 200, `Expected 200 on idempotent retry, got ${retryRes.status}`);
    assert(
      Number(retryRes.json?.data?.withdrawal_id) === withdrawalId,
      'Expected same withdrawal_id for idempotent retry'
    );

    logStep('5) Complete the withdrawal via OTP verify (ledger debit only on completed)');
    const knownOtp = '123456';

    // Set known OTP hash for deterministic verify.
    await pool.query(
      `
      UPDATE withdrawals
      SET
        status = 'otp_pending',
        failure_reason = NULL,
        otp_hash = $2,
        otp_expires_at = NOW() + INTERVAL '5 minutes',
        otp_attempts = 0,
        otp_locked_until = NULL,
        updated_at = NOW()
      WHERE id = $1
      `,
      [withdrawalId, hashOtp(knownOtp)]
    );

    const verifyRes = await requestJson(`${base}/api/withdrawals/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem1 },
      body: JSON.stringify({ withdrawal_id: withdrawalId, otp: knownOtp }),
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(verifyRes, null, 2));
    assert(verifyRes.status === 200, `Expected 200 from verify, got ${verifyRes.status}`);

    const wDone = await pool.query(
      `
      SELECT id, status
      FROM withdrawals
      WHERE id = $1
      `,
      [withdrawalId]
    );
    assert(String(wDone.rows?.[0]?.status) === 'completed', 'Expected withdrawal status completed');

    const ledgerW = await pool.query(
      `
      SELECT 1
      FROM ledger_entries
      WHERE source_type = 'withdrawal'
        AND source_id = $1
      LIMIT 1
      `,
      [withdrawalId]
    );
    assert((ledgerW.rows ?? []).length === 1, 'Expected ledger debit for completed withdrawal');

    logStep('6) Second withdrawal after completion -> insufficient balance');
    const secondTry = await requestJson(`${base}/api/withdrawals/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': newIdempotencyKey() },
      body: JSON.stringify({ owner_id: ownerId, amount: 2000, payout_phone: '0772123456' }),
    });
    assert(secondTry.status === 409, `Expected 409, got ${secondTry.status}`);
    assert(secondTry.json?.error?.code, 'Expected an error code');

    logStep('7) Attempt invalid state transition -> expect 409');
    const invalidRes = await requestJson(`${base}/api/withdrawals/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withdrawal_id: withdrawalId, otp: knownOtp }),
    });
    assert(invalidRes.status === 409, `Expected 409, got ${invalidRes.status}`);
    assert(invalidRes.json?.error?.code === 'INVALID_WITHDRAWAL_STATE', 'Expected INVALID_WITHDRAWAL_STATE');

    logStep('8) OTP brute force -> expect OTP_LOCKED');

    // Top up balance so we can create a new OTP withdrawal for brute-force testing.
    const topupVoucherCode = `SMOKE-FIN-VOUCHER-TOPUP-${now}`;
    const v2Res = await pool.query(
      `
      INSERT INTO vouchers (code, package_id, status, expires_at)
      VALUES ($1, $2, 'available'::voucher_status, NOW() + INTERVAL '1 hour')
      RETURNING id
      `,
      [topupVoucherCode, packageId]
    );
    created.voucherIds.push(Number(v2Res.rows[0].id));

    const topupRes = await requestJson(`${base}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voucher_code: topupVoucherCode,
        bundle_id: packageId,
        customer_phone: '256700000009',
        amount_ugx: 3000,
        payment_method: 'mobile_money',
        client_id: ownerId,
      }),
    });
    assert(topupRes.status === 201, `Expected 201 from top-up transaction, got ${topupRes.status}`);
    const topupId = Number(topupRes.json?.data?.id);
    if (topupId) created.transactionIds.push(topupId);

    const idemBrute = newIdempotencyKey();
    const bruteReq = await requestJson(`${base}/api/withdrawals/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemBrute },
      body: JSON.stringify({ owner_id: ownerId, amount: 500, payout_phone: '0772123456' }),
    });
    assert(bruteReq.status === 201, `Expected 201, got ${bruteReq.status}`);
    const bruteWithdrawalId = Number(bruteReq.json?.data?.withdrawal_id);
    created.withdrawalIds.push(bruteWithdrawalId);

    await pool.query(
      `
      UPDATE withdrawals
      SET
        status = 'otp_pending',
        failure_reason = NULL,
        otp_hash = $2,
        otp_expires_at = NOW() + INTERVAL '5 minutes',
        otp_attempts = 0,
        otp_locked_until = NULL,
        updated_at = NOW()
      WHERE id = $1
      `,
      [bruteWithdrawalId, hashOtp('999999')]
    );

    let lockedSeen = false;
    for (let i = 0; i < 6; i++) {
      const r = await requestJson(`${base}/api/withdrawals/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawal_id: bruteWithdrawalId, otp: '000000' }),
      });

      if (r.status === 429) {
        assert(r.json?.error?.code === 'OTP_LOCKED', 'Expected OTP_LOCKED');
        lockedSeen = true;
        break;
      }

      assert(r.status === 400, `Expected 400 for wrong OTP (attempt ${i + 1}), got ${r.status}`);
      assert(r.json?.error?.code === 'OTP_INVALID', 'Expected OTP_INVALID');
    }

    assert(lockedSeen, 'Expected to observe OTP_LOCKED by the 5th attempt');

    // eslint-disable-next-line no-console
    console.log('[OK] smoke financial integrity passed');
  } finally {
    // Cleanup (safe to re-run)
    try {
      if (created.withdrawalIds.length) {
        await pool.query('DELETE FROM ledger_entries WHERE source_type = \'withdrawal\' AND source_id = ANY($1::bigint[])', [
          created.withdrawalIds,
        ]);
        await pool.query('DELETE FROM withdrawal_transactions WHERE withdrawal_id = ANY($1::bigint[])', [created.withdrawalIds]);
        await pool.query('DELETE FROM withdrawals WHERE id = ANY($1::bigint[])', [created.withdrawalIds]);
      }

      if (created.transactionIds.length) {
        await pool.query('DELETE FROM ledger_entries WHERE source_type = \'transaction\' AND source_id = ANY($1::bigint[])', [
          created.transactionIds,
        ]);
        await pool.query('DELETE FROM transactions WHERE id = ANY($1::bigint[])', [created.transactionIds]);
      }

      if (created.voucherIds.length) {
        await pool.query('DELETE FROM vouchers WHERE id = ANY($1::bigint[])', [created.voucherIds]);
      }

      if (created.packageIds.length) {
        await pool.query('DELETE FROM packages WHERE id = ANY($1::bigint[])', [created.packageIds]);
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Smoke financial integrity failed:', err?.message ?? err);
  process.exit(1);
});
