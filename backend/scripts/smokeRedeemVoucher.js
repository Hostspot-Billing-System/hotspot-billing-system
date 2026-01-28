import '../src/config/env.js';
import { pool } from '../src/config/db.js';
import { VouchersService } from '../src/services/vouchersService.js';

async function main() {
  const pkgRes = await pool.query('SELECT id FROM packages ORDER BY id ASC LIMIT 1');
  const packageId = pkgRes.rows[0]?.id;
  if (!packageId) throw new Error('No packages in DB');

  const code = `SMOKE-REDEEM-${Date.now()}`;

  const insertRes = await pool.query(
    `
    INSERT INTO vouchers (code, package_id, status, expires_at)
    VALUES ($1, $2, 'available'::voucher_status, NOW() + INTERVAL '1 hour')
    RETURNING id
    `,
    [code, packageId]
  );

  const voucherId = insertRes.rows[0].id;

  try {
    const redeemed = await VouchersService.redeemVoucher(code);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(redeemed, null, 2));
  } finally {
    await pool.query('DELETE FROM vouchers WHERE id = $1', [voucherId]);
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Smoke redeem failed:', err?.message ?? err);
  process.exit(1);
});
