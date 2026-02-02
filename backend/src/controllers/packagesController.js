import { query } from '../config/db.js';

async function hasPublicTableColumn({ table, column }) {
  const t = String(table ?? '').trim();
  const c = String(column ?? '').trim();
  if (!t || !c) return false;
  const res = await query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = $2
    LIMIT 1
    `,
    [t, c]
  );
  return Boolean(res.rows?.[0]);
}

export async function listPackages(req, res) {
  try {
    console.info('GET /api/packages');


    const hasPriceUgx = await hasPublicTableColumn({ table: 'packages', column: 'price_ugx' });
    const hasIsActive = await hasPublicTableColumn({ table: 'packages', column: 'is_active' });

    const whereActive = hasIsActive ? 'WHERE is_active = TRUE' : '';

    const result = await query(
      `
      SELECT id::int AS id,
        name,
        duration_minutes::int AS duration_minutes,
        ${hasPriceUgx ? 'price_ugx::int AS price_ugx' : 'NULL::int AS price_ugx'},
        ${hasIsActive ? 'is_active' : 'TRUE AS is_active'}
      FROM packages
      ${whereActive}
      ORDER BY duration_minutes ASC, id ASC
      `
    );

    // Return a plain JSON array for simple clients.
    return res.status(200).json(result.rows);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}

export async function listPackagesFull(req, res) {
  try {
    console.info('GET /api/packages/full');

    const hasPriceUgx = await hasPublicTableColumn({ table: 'packages', column: 'price_ugx' });
    const hasIsActive = await hasPublicTableColumn({ table: 'packages', column: 'is_active' });

    const result = await query(
      `
      SELECT
        id::int AS id,
        name,
        duration_minutes,
        mikrotik_profile,
        ${hasPriceUgx ? 'price_ugx::int AS price_ugx' : 'NULL::int AS price_ugx'},
        ${hasIsActive ? 'is_active' : 'TRUE AS is_active'},
        created_at
      FROM packages
      ORDER BY duration_minutes ASC, id ASC
      `
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('[Packages] listPackagesFull failed', {
      code: err?.code ?? null,
      message: err?.message ?? String(err),
    });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}
