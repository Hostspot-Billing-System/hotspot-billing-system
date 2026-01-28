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

async function main() {
  await checkDbConnection();

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s));
    s.on('error', reject);
  });

  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const createdIds = [];

  try {
    const pkgRes = await pool.query('SELECT id FROM packages ORDER BY id ASC LIMIT 1');
    const packageId = pkgRes.rows[0]?.id;
    if (!packageId) throw new Error('No packages found in DB');

    const now = Date.now();
    const codeOk = `SMOKE-REDEEM-OK-${now}`;
    const codeExpired = `SMOKE-REDEEM-EXP-${now}`;

    const okIns = await pool.query(
      `
      INSERT INTO vouchers (code, package_id, status, created_at, expires_at)
      VALUES ($1, $2, 'available'::voucher_status, NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour')
      RETURNING id
      `,
      [codeOk, packageId]
    );
    createdIds.push(okIns.rows[0].id);

    const expIns = await pool.query(
      `
      INSERT INTO vouchers (code, package_id, status, created_at, expires_at)
      VALUES ($1, $2, 'available'::voucher_status, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')
      RETURNING id
      `,
      [codeExpired, packageId]
    );
    createdIds.push(expIns.rows[0].id);

    const redeemOnce = await requestJson(`${base}/api/vouchers/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codeOk }),
    });

    const redeemAgain = await requestJson(`${base}/api/vouchers/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codeOk }),
    });

    const redeemExpired = await requestJson(`${base}/api/vouchers/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: codeExpired }),
    });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          redeemOnce,
          redeemAgain,
          redeemExpired,
        },
        null,
        2
      )
    );
  } finally {
    if (createdIds.length) {
      await pool.query('DELETE FROM vouchers WHERE id = ANY($1::bigint[])', [createdIds]);
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Smoke redeem cases failed:', err?.message ?? err);
  process.exit(1);
});
