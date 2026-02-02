import '../src/config/env.js';
import { pool } from '../src/config/db.js';

function asPositiveInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const intVal = Math.trunc(num);
  return intVal > 0 ? intVal : null;
}

async function ensureTablesExist() {
  // Basic sanity check so we fail fast with a clear error.
  const result = await pool.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `,
    [['packages', 'vouchers']]
  );

  const present = new Set(result.rows.map((r) => r.table_name));
  for (const name of ['packages', 'vouchers']) {
    if (!present.has(name)) {
      throw new Error(
        `Missing required table '${name}'. Apply backend/sql/schema.sql first (e.g. node scripts/applySchema.js).`
      );
    }
  }
}

async function main() {
  // Safety: prevent accidental production writes unless explicitly allowed.
  const appEnv = String(process.env.APP_ENV ?? 'development').toLowerCase();
  const allowProd = String(process.env.SEED_ALLOW_PROD ?? '').toLowerCase() === 'true';
  if (appEnv === 'production' && !allowProd) {
    throw new Error('Refusing to seed in production. Set SEED_ALLOW_PROD=true to override.');
  }

  await ensureTablesExist();

  const expiresDays = asPositiveInt(process.env.SEED_EXPIRES_DAYS);
  const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString() : null;

  const packages = [
    { key: '2h', name: '2 Hours', duration_minutes: 120, mikrotik_profile: '2h-unlimited', price_ugx: 500 },
    { key: '12h', name: '12 Hours', duration_minutes: 720, mikrotik_profile: '12h-unlimited', price_ugx: 1000 },
    { key: 'daily', name: 'Daily', duration_minutes: 1440, mikrotik_profile: 'daily-unlimited', price_ugx: 1500 },
    { key: 'weekly', name: 'Weekly', duration_minutes: 10080, mikrotik_profile: 'weekly-unlimited', price_ugx: 6000 },
    { key: 'monthly', name: 'Monthly', duration_minutes: 43200, mikrotik_profile: 'monthly-unlimited', price_ugx: 23000 },
  ];

  const vouchers = [
    { code: 'TEST-2H-001', packageKey: '2h' },
    { code: 'TEST-12H-001', packageKey: '12h' },
    { code: 'TEST-DAILY-001', packageKey: 'daily' },
    { code: 'TEST-WEEKLY-001', packageKey: 'weekly' },
    { code: 'TEST-MONTHLY-001', packageKey: 'monthly' },
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Use the same connection inside the transaction.
    // (We still keep helpers using pool.query, so run inline queries here.)
    const packageIdByKey = new Map();
    for (const pkg of packages) {
      await client.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS price_ugx INTEGER NULL`);
      await client.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);
      const result = await client.query(
        `
        INSERT INTO packages (name, duration_minutes, mikrotik_profile, price_ugx, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (name) DO UPDATE
        SET duration_minutes = EXCLUDED.duration_minutes,
            mikrotik_profile = EXCLUDED.mikrotik_profile,
            price_ugx = EXCLUDED.price_ugx,
            is_active = TRUE
        RETURNING id::int AS id, name
        `,
        [pkg.name, pkg.duration_minutes, pkg.mikrotik_profile, pkg.price_ugx]
      );
      packageIdByKey.set(pkg.key, result.rows[0]);
    }

    const seeded = [];
    for (const v of vouchers) {
      const packageRow = packageIdByKey.get(v.packageKey);
      const result = await client.query(
        `
        INSERT INTO vouchers (code, package_id, status, expires_at, used_at)
        VALUES ($1, $2, 'available', $3::timestamptz, NULL)
        ON CONFLICT (code) DO UPDATE
        SET package_id = EXCLUDED.package_id,
            status = 'available',
            expires_at = EXCLUDED.expires_at,
            used_at = NULL
        RETURNING code, (xmax = 0) AS inserted
        `,
        [v.code, packageRow.id, expiresAt]
      );
      seeded.push(result.rows[0]);
    }

    await client.query('COMMIT');

    const insertedCount = seeded.filter((r) => r.inserted).length;
    const updatedCount = seeded.length - insertedCount;

    // eslint-disable-next-line no-console
    console.log('Seeded mock vouchers successfully.');
    // eslint-disable-next-line no-console
    console.log(`- vouchers inserted: ${insertedCount}`);
    // eslint-disable-next-line no-console
    console.log(`- vouchers updated:  ${updatedCount}`);
    // eslint-disable-next-line no-console
    console.log(`- expires_at: ${expiresAt ?? 'NULL'}`);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failures
    }
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to seed mock vouchers:', err?.message ?? err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
