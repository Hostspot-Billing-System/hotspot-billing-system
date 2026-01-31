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

async function ensureWithdrawalsOtpColumns() {
  await pool.query(`
    ALTER TABLE IF EXISTS withdrawals
      ADD COLUMN IF NOT EXISTS requested_amount NUMERIC(12,2) NULL,
      ADD COLUMN IF NOT EXISTS payout_phone VARCHAR(20) NULL,
      ADD COLUMN IF NOT EXISTS verification_contact VARCHAR(50) NULL,
      ADD COLUMN IF NOT EXISTS otp_hash TEXT NULL,
      ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS failure_reason TEXT NULL,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL;
  `);

  await pool.query(`
    UPDATE withdrawals
    SET updated_at = COALESCE(updated_at, created_at)
    WHERE updated_at IS NULL;
  `);
}

async function getAvailableBalanceForClient(clientId) {
  const earnedRes = await pool.query(
    `
    SELECT COALESCE(SUM(t.net_amount), 0)::float8 AS earned
    FROM transactions t
    WHERE t.client_id = $1
      AND t.status = 'completed'
      AND t.paid_at IS NOT NULL
    `,
    [clientId]
  );
  const earned = Number(earnedRes.rows?.[0]?.earned ?? 0);

  const withdrawnRes = await pool.query(
    `
    SELECT COALESCE(SUM(w.net_amount), 0)::float8 AS withdrawn
    FROM withdrawals w
    WHERE w.client_id = $1
      AND w.status <> 'failed'
    `,
    [clientId]
  );
  const withdrawn = Number(withdrawnRes.rows?.[0]?.withdrawn ?? 0);

  return earned - withdrawn;
}

async function main() {
  await checkDbConnection();

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s));
    s.on('error', reject);
  });

  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const createdPackageIds = [];
  const createdTransactionIds = [];
  const createdWithdrawalIds = [];

  try {
    logStep('0) Ensure withdrawals OTP columns exist');
    await ensureWithdrawalsOtpColumns();
    // eslint-disable-next-line no-console
    console.log('[OK] withdrawals schema ready');

    logStep('1) Insert fake client with balance (via transactions rows)');
    const clientId = 900000 + (Date.now() % 100000);

    const pkgRes = await pool.query(
      `
      INSERT INTO packages (name, duration_minutes, mikrotik_profile)
      VALUES ($1, $2, $3)
      RETURNING id
      `,
      [`SMOKE-WITHDRAWALS-${Date.now()}`, 60, 'smoke-profile']
    );
    const packageId = Number(pkgRes.rows[0].id);
    createdPackageIds.push(packageId);

    const txAmount = 10000;
    const txCommission = 600;
    const txRows = 3;

    for (let i = 0; i < txRows; i++) {
      const reference = `SMOKE-TX-${Date.now()}-${i}`;
      const ins = await pool.query(
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
          client_id,
          paid_at
        )
        VALUES ($1, NULL, $2, $3, $4, $5, 'completed', 'smoke', $6, NOW())
        RETURNING id
        `,
        [reference, packageId, '0772123456', txAmount, txCommission, clientId]
      );
      createdTransactionIds.push(Number(ins.rows[0].id));
    }

    const balanceBefore = await getAvailableBalanceForClient(clientId);
    // eslint-disable-next-line no-console
    console.log(`[OK] client_id=${clientId} available balance before: ${balanceBefore} UGX`);
    assert(balanceBefore > 0, 'Expected positive available balance');

    logStep('2) Call POST /api/withdrawals/preview → expect allowed');
    const previewRes = await requestJson(`${base}/api/withdrawals/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 1000 }),
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(previewRes, null, 2));
    assert(previewRes.status === 200, `Expected 200, got ${previewRes.status}`);
    assert(previewRes.json?.success === true, 'Expected success true');
    assert(Number(previewRes.json?.data?.net_amount) > 0, 'Expected net_amount > 0');

    logStep('3) Call POST /api/withdrawals/request → expect OTP sent');
    const requestRes = await requestJson(`${base}/api/withdrawals/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        amount: 1000,
        payout_phone: '0772123456',
      }),
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(requestRes, null, 2));
    assert(requestRes.status === 201, `Expected 201, got ${requestRes.status}`);
    assert(requestRes.json?.success === true, 'Expected success true');
    const withdrawalId = Number(requestRes.json?.data?.withdrawal_id);
    assert(Number.isFinite(withdrawalId) && withdrawalId > 0, 'Expected withdrawal_id');
    createdWithdrawalIds.push(withdrawalId);
    assert(requestRes.json?.data?.verification_contact, 'Expected verification_contact');

    logStep('4) Call POST /api/withdrawals/verify with wrong OTP → expect failure');
    const wrongVerifyRes = await requestJson(`${base}/api/withdrawals/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withdrawal_id: withdrawalId, otp: '000000' }),
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(wrongVerifyRes, null, 2));
    assert(wrongVerifyRes.status >= 400, `Expected failure status, got ${wrongVerifyRes.status}`);
    assert(wrongVerifyRes.json?.success === false, 'Expected success false');

    logStep('5) Reset OTP for test and call POST /api/withdrawals/verify with correct OTP → expect success');
    const knownOtp = '123456';
    await pool.query(
      `
      UPDATE withdrawals
      SET status = 'pending_otp',
          failure_reason = NULL,
          otp_hash = $2,
          otp_expires_at = NOW() + INTERVAL '5 minutes',
          updated_at = NOW()
      WHERE id = $1
      `,
      [withdrawalId, hashOtp(knownOtp)]
    );

    const okVerifyRes = await requestJson(`${base}/api/withdrawals/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withdrawal_id: withdrawalId, otp: knownOtp }),
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(okVerifyRes, null, 2));
    assert(okVerifyRes.status === 200, `Expected 200, got ${okVerifyRes.status}`);
    assert(okVerifyRes.json?.success === true, 'Expected success true');

    logStep('6) Verify withdrawal marked completed');
    const wRes = await pool.query(
      `
      SELECT id, status, completed_at, net_amount, client_id
      FROM withdrawals
      WHERE id = $1
      `,
      [withdrawalId]
    );
    const w = wRes.rows?.[0];
    assert(w, 'Expected withdrawal row');
    // eslint-disable-next-line no-console
    console.log({ id: w.id, status: w.status, completed_at: w.completed_at, net_amount: w.net_amount, client_id: w.client_id });
    assert(String(w.status) === 'completed', `Expected status completed, got ${w.status}`);
    assert(w.completed_at != null, 'Expected completed_at set');

    logStep('7) Verify balance deducted correctly');
    const balanceAfter = await getAvailableBalanceForClient(clientId);
    const netWithdrawn = Number(w.net_amount ?? 0);
    const expectedAfter = Number((balanceBefore - netWithdrawn).toFixed(2));
    // eslint-disable-next-line no-console
    console.log(`[OK] available after: ${balanceAfter} UGX (expected ~${expectedAfter} UGX)`);
    assert(Math.abs(balanceAfter - expectedAfter) < 0.01, 'Balance did not deduct by withdrawal net_amount');

    logStep('8) Clean up test data');
    // eslint-disable-next-line no-console
    console.log('[OK] smoke withdrawals passed');
  } finally {
    try {
      if (createdWithdrawalIds.length) {
        await pool.query('DELETE FROM withdrawal_transactions WHERE withdrawal_id = ANY($1::bigint[])', [createdWithdrawalIds]);
        await pool.query('DELETE FROM withdrawals WHERE id = ANY($1::bigint[])', [createdWithdrawalIds]);
      }
      if (createdTransactionIds.length) {
        await pool.query('DELETE FROM transactions WHERE id = ANY($1::bigint[])', [createdTransactionIds]);
      }
      if (createdPackageIds.length) {
        await pool.query('DELETE FROM packages WHERE id = ANY($1::bigint[])', [createdPackageIds]);
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    }
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Smoke withdrawals failed:', err?.message ?? err);
  process.exit(1);
});
