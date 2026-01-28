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

  const createdVoucherIds = [];

  try {
    const pkgRes = await pool.query('SELECT id FROM packages ORDER BY id ASC LIMIT 1');
    const packageId = pkgRes.rows[0]?.id;
    if (!packageId) {
      throw new Error('No packages found in DB; cannot run Phase 7 smoke.');
    }

    // Create controlled fixtures (so we don't delete real data).
    const now = Date.now();
    const codeDeletable = `SMOKE7-DEL-${now}`;
    const codeExpired = `SMOKE7-EXP-${now}`;
    const codeUsed = `SMOKE7-USED-${now}`;

    const insDeletable = await pool.query(
      `
      INSERT INTO vouchers (code, package_id, status, created_at, expires_at)
      VALUES ($1, $2, 'available'::voucher_status, NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour')
      RETURNING id, code
      `,
      [codeDeletable, packageId]
    );

    const insExpired = await pool.query(
      `
      INSERT INTO vouchers (code, package_id, status, created_at, expires_at)
      VALUES ($1, $2, 'available'::voucher_status, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')
      RETURNING id, code
      `,
      [codeExpired, packageId]
    );

    const insUsed = await pool.query(
      `
      INSERT INTO vouchers (code, package_id, status, created_at, used_at)
      VALUES ($1, $2, 'used'::voucher_status, NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '5 minutes')
      RETURNING id, code
      `,
      [codeUsed, packageId]
    );

    const deletableId = insDeletable.rows[0].id;
    const expiredId = insExpired.rows[0].id;
    const usedId = insUsed.rows[0].id;

    createdVoucherIds.push(deletableId, expiredId, usedId);

    const results = {};

    // 1) Expiration-on-read: expired fixture should show as expired.
    results.listExpired = await requestJson(`${base}/api/vouchers?status=expired`);
    const expiredRow = results.listExpired.json?.data?.find((v) => v.code === codeExpired);
    results.expirationOnRead = {
      found: Boolean(expiredRow),
      status: expiredRow?.status ?? null,
    };

    // 2) Single delete error mapping
    results.deleteUsed = await requestJson(`${base}/api/vouchers/${usedId}`, { method: 'DELETE' });
    results.deleteExpired = await requestJson(`${base}/api/vouchers/${expiredId}`, { method: 'DELETE' });
    results.deleteDeletable = await requestJson(`${base}/api/vouchers/${deletableId}`, { method: 'DELETE' });

    // 3) Non-existent delete
    const maxIdRes = await pool.query('SELECT COALESCE(MAX(id), 0) AS max_id FROM vouchers');
    const missingId = Number(maxIdRes.rows[0]?.max_id ?? 0) + 999999;
    results.deleteMissing = await requestJson(`${base}/api/vouchers/${missingId}`, { method: 'DELETE' });

    // 4) Bulk delete: mix of available, used, expired.
    const bulkNow = Date.now() + 1;
    const bulkCodeA = `SMOKE7-BULK-A-${bulkNow}`;
    const bulkCodeB = `SMOKE7-BULK-B-${bulkNow}`;
    const bulkCodeUsed = `SMOKE7-BULK-U-${bulkNow}`;
    const bulkCodeExpired = `SMOKE7-BULK-E-${bulkNow}`;

    const b1 = await pool.query(
      `
      INSERT INTO vouchers (code, package_id, status, created_at, expires_at)
      VALUES ($1, $2, 'available'::voucher_status, NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour')
      RETURNING id
      `,
      [bulkCodeA, packageId]
    );
    const b2 = await pool.query(
      `
      INSERT INTO vouchers (code, package_id, status, created_at, expires_at)
      VALUES ($1, $2, 'available'::voucher_status, NOW() - INTERVAL '1 minute', NOW() + INTERVAL '1 hour')
      RETURNING id
      `,
      [bulkCodeB, packageId]
    );
    const bUsed = await pool.query(
      `
      INSERT INTO vouchers (code, package_id, status, created_at, used_at)
      VALUES ($1, $2, 'used'::voucher_status, NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '5 minutes')
      RETURNING id
      `,
      [bulkCodeUsed, packageId]
    );
    const bExpired = await pool.query(
      `
      INSERT INTO vouchers (code, package_id, status, created_at, expires_at)
      VALUES ($1, $2, 'available'::voucher_status, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')
      RETURNING id
      `,
      [bulkCodeExpired, packageId]
    );

    const bulkIds = [b1.rows[0].id, b2.rows[0].id, bUsed.rows[0].id, bExpired.rows[0].id];
    createdVoucherIds.push(...bulkIds);

    results.deleteBulk = await requestJson(`${base}/api/vouchers/delete-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: bulkIds }),
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(results, null, 2));
  } finally {
    // Cleanup fixtures so this is safe to re-run.
    if (createdVoucherIds.length > 0) {
      await pool.query('DELETE FROM vouchers WHERE id = ANY($1::bigint[])', [createdVoucherIds]);
    }

    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Phase 7 smoke failed:', err?.message ?? err);
  process.exit(1);
});
