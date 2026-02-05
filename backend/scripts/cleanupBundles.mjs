import '../src/config/env.js';
import { pool } from '../src/config/db.js';

function isTrue(value) {
  return String(value ?? '').toLowerCase() === 'true';
}

async function tableExists(client, tableName) {
  const res = await client.query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = $1
    LIMIT 1
    `,
    [tableName]
  );
  return (res.rows?.length ?? 0) > 0;
}

async function ensureRequiredTables(client) {
  const required = ['packages'];
  const res = await client.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    `,
    [required]
  );
  const present = new Set(res.rows.map((r) => r.table_name));
  for (const name of required) {
    if (!present.has(name)) {
      throw new Error(
        `Missing required table '${name}'. Apply backend/sql/schema.sql first (e.g. node scripts/applySchema.js).`
      );
    }
  }
}

const OFFICIAL = [
  {
    key: '2h',
    name: '2 Hours',
    duration_minutes: 120,
    mikrotik_profile: '2h-unlimited',
    price_ugx: 500,
    aliases: ['2 Hours', '2 Hours Unlimited'],
  },
  {
    key: '12h',
    name: '12 Hours',
    duration_minutes: 720,
    mikrotik_profile: '12h-unlimited',
    price_ugx: 1000,
    aliases: ['12 Hours', '12 Hours Unlimited'],
  },
  {
    key: 'daily',
    name: 'Daily',
    duration_minutes: 1440,
    mikrotik_profile: 'daily-unlimited',
    price_ugx: 1500,
    aliases: ['Daily', 'Daily Plan', 'Daily Unlimited'],
  },
  {
    key: 'weekly',
    name: 'Weekly',
    duration_minutes: 10080,
    mikrotik_profile: 'weekly-unlimited',
    price_ugx: 6000,
    aliases: ['Weekly', 'Weekly Plan', 'Weekly Unlimited'],
  },
  {
    key: 'monthly',
    name: 'Monthly',
    duration_minutes: 43200,
    mikrotik_profile: 'monthly-unlimited',
    price_ugx: 23000,
    aliases: ['Monthly', 'Monthly Plan', 'Monthly Unlimited'],
  },
];

function isJunkPackageName(name) {
  const n = String(name ?? '').trim();
  if (!n) return true;
  return /^smoke_/i.test(n) || /^test_/i.test(n);
}

function byPreferredCanonicalThenId(canonicalName) {
  return (a, b) => {
    const aIsCanonical = String(a?.name ?? '').trim() === canonicalName;
    const bIsCanonical = String(b?.name ?? '').trim() === canonicalName;
    if (aIsCanonical !== bIsCanonical) return aIsCanonical ? -1 : 1;
    return Number(a?.id ?? 0) - Number(b?.id ?? 0);
  };
}

async function main() {
  // Safety: prevent accidental production writes unless explicitly allowed.
  const appEnv = String(process.env.APP_ENV ?? 'development').toLowerCase();
  const allowProd = isTrue(process.env.CLEANUP_ALLOW_PROD);
  if (appEnv === 'production' && !allowProd) {
    throw new Error('Refusing to cleanup in production. Set CLEANUP_ALLOW_PROD=true to override.');
  }

  const client = await pool.connect();
  try {
    await ensureRequiredTables(client);

    const hasVouchers = await tableExists(client, 'vouchers');
    const hasVoucherBatches = await tableExists(client, 'voucher_batches');
    const hasHotspotSessions = await tableExists(client, 'hotspot_sessions');
    const hasTransactions = await tableExists(client, 'transactions');
    const hasWithdrawalTx = await tableExists(client, 'withdrawal_transactions');
    const hasLedgerEntries = await tableExists(client, 'ledger_entries');

    await client.query('BEGIN');

    // Ensure pricing + activation columns exist.
    await client.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS price_ugx INTEGER NULL`);
    await client.query(`ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);

    const existingRes = await client.query(
      `
      SELECT id::bigint AS id, name, duration_minutes::int AS duration_minutes, mikrotik_profile
      FROM packages
      ORDER BY id ASC
      `
    );

    const existing = existingRes.rows ?? [];

    const officialDurations = new Set(OFFICIAL.map((p) => Number(p.duration_minutes)));
    const officialByDuration = new Map(OFFICIAL.map((p) => [Number(p.duration_minutes), p]));

    // 1) Ensure canonical packages exist (prefer rows that already have the canonical name).
    const canonicalIdByDuration = new Map();

    for (const pkg of OFFICIAL) {
      const candidates = existing
        .filter((p) => Number(p.duration_minutes) === Number(pkg.duration_minutes))
        .filter((p) => !isJunkPackageName(p.name))
        .filter((p) => pkg.aliases.includes(String(p.name).trim()) || String(p.name).trim() === pkg.name)
        .sort(byPreferredCanonicalThenId(pkg.name));

      const chosen = candidates[0] ?? null;
      if (chosen?.id) {
        canonicalIdByDuration.set(Number(pkg.duration_minutes), Number(chosen.id));
        await client.query(
          `
          UPDATE packages
          SET name = $2,
              duration_minutes = $3,
              mikrotik_profile = $4,
              price_ugx = $5,
              is_active = TRUE
          WHERE id = $1
          `,
          [chosen.id, pkg.name, pkg.duration_minutes, pkg.mikrotik_profile, pkg.price_ugx]
        );
        continue;
      }

      const inserted = await client.query(
        `
        INSERT INTO packages (name, duration_minutes, mikrotik_profile, price_ugx, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        RETURNING id::int AS id
        `,
        [pkg.name, pkg.duration_minutes, pkg.mikrotik_profile, pkg.price_ugx]
      );
      canonicalIdByDuration.set(Number(pkg.duration_minutes), Number(inserted.rows[0].id));
    }

    // Refresh package list after inserts/updates.
    const allRes = await client.query(
      `
      SELECT id::bigint AS id, name, duration_minutes::int AS duration_minutes
      FROM packages
      ORDER BY id ASC
      `
    );
    const allPackages = allRes.rows ?? [];

    const merges = [];
    const deleteIds = [];

    for (const p of allPackages) {
      const id = Number(p.id);
      const name = String(p.name ?? '').trim();
      const duration = Number(p.duration_minutes);
      if (!Number.isFinite(id) || id <= 0) continue;

      // Delete SMOKE_/TEST_ packages outright.
      if (isJunkPackageName(name)) {
        deleteIds.push(id);
        continue;
      }

      // Delete any non-official durations.
      if (!officialDurations.has(duration)) {
        deleteIds.push(id);
        continue;
      }

      const canonicalId = canonicalIdByDuration.get(duration);
      const official = officialByDuration.get(duration);
      if (!canonicalId || !official) {
        deleteIds.push(id);
        continue;
      }

      if (id === Number(canonicalId)) {
        // Ensure name/profile are canonical.
        await client.query(
          `
          UPDATE packages
          SET name = $2,
              duration_minutes = $3,
              mikrotik_profile = $4,
              price_ugx = $5,
              is_active = TRUE
          WHERE id = $1
          `,
          [id, official.name, official.duration_minutes, official.mikrotik_profile, official.price_ugx]
        );
      } else {
        // Duplicate of an official bundle — merge into canonical.
        merges.push({ from: id, to: Number(canonicalId), duration_minutes: duration });
      }
    }

    // Apply merges by updating FKs, then delete the duplicate package rows.
    for (const m of merges) {
      if (hasTransactions) {
        await client.query(`UPDATE transactions SET bundle_id = $2 WHERE bundle_id = $1`, [m.from, m.to]);
      }
      if (hasVouchers) {
        await client.query(`UPDATE vouchers SET package_id = $2 WHERE package_id = $1`, [m.from, m.to]);
      }
      if (hasVoucherBatches) {
        await client.query(`UPDATE voucher_batches SET package_id = $2 WHERE package_id = $1`, [m.from, m.to]);
      }
      deleteIds.push(m.from);
    }

    const uniqueDeleteIds = Array.from(new Set(deleteIds));
    if (uniqueDeleteIds.length > 0) {
      // Remove dependent rows in a safe order to satisfy ON DELETE RESTRICT.
      if (hasHotspotSessions && hasVouchers) {
        await client.query(
          `
          DELETE FROM hotspot_sessions hs
          USING vouchers v
          WHERE hs.voucher_id = v.id
            AND v.package_id = ANY($1::bigint[])
          `,
          [uniqueDeleteIds]
        );
      }

      if (hasVouchers) {
        await client.query(`DELETE FROM vouchers WHERE package_id = ANY($1::bigint[])`, [uniqueDeleteIds]);
      }

      if (hasVoucherBatches) {
        await client.query(`DELETE FROM voucher_batches WHERE package_id = ANY($1::bigint[])`, [uniqueDeleteIds]);
      }

      let deletedTransactionIds = [];
      if (hasTransactions) {
        const txIdsRes = await client.query(
          `
          SELECT id::bigint AS id
          FROM transactions
          WHERE bundle_id = ANY($1::bigint[])
          `,
          [uniqueDeleteIds]
        );
        deletedTransactionIds = (txIdsRes.rows ?? []).map((r) => Number(r.id));

        if (deletedTransactionIds.length > 0 && hasWithdrawalTx) {
          await client.query(
            `
            DELETE FROM withdrawal_transactions
            WHERE transaction_id = ANY($1::bigint[])
            `,
            [deletedTransactionIds]
          );
        }

        if (deletedTransactionIds.length > 0 && hasLedgerEntries) {
          await client.query(
            `
            DELETE FROM ledger_entries
            WHERE source_type = 'transaction'
              AND source_id = ANY($1::bigint[])
            `,
            [deletedTransactionIds]
          );
        }

        await client.query(`DELETE FROM transactions WHERE bundle_id = ANY($1::bigint[])`, [uniqueDeleteIds]);
      }

      await client.query(`DELETE FROM packages WHERE id = ANY($1::bigint[])`, [uniqueDeleteIds]);
    }

    await client.query('COMMIT');

    // eslint-disable-next-line no-console
    console.log('Bundle cleanup complete.');
    // eslint-disable-next-line no-console
    console.log(`- kept bundles: ${OFFICIAL.length}`);
    // eslint-disable-next-line no-console
    console.log(`- merged bundles: ${merges.length}`);
    // eslint-disable-next-line no-console
    console.log(`- deleted bundles: ${uniqueDeleteIds.length}`);
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
    console.error('Failed to cleanup bundles:', err?.message ?? err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
