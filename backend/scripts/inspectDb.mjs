import '../src/config/env.js';
import { pool } from '../src/config/db.js';

async function tableExists(tableName) {
  const result = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
    ) AS exists
    `,
    ['public', tableName]
  );
  return Boolean(result.rows?.[0]?.exists);
}

async function listTables() {
  const result = await pool.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1
    ORDER BY table_name
    `,
    ['public']
  );
  return result.rows.map((r) => r.table_name);
}

async function listColumns(tableName) {
  const result = await pool.query(
    `
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = $2
    ORDER BY ordinal_position
    `,
    ['public', tableName]
  );
  return result.rows;
}

async function main() {
  const tables = await listTables();
  const interesting = [
    'packages',
    'voucher_batches',
    'vouchers',
    'hotspot_sessions',
    'portal_sessions',
    'transactions',
    'withdrawals',
    'withdrawal_transactions',
    'ledger_entries',
  ];

  const snapshot = {
    ok: true,
    tables,
    details: {},
  };

  for (const name of interesting) {
    if (await tableExists(name)) {
      snapshot.details[name] = await listColumns(name);
    }
  }

  console.log(JSON.stringify(snapshot, null, 2));
}

main()
  .catch((err) => {
    console.error('inspectDb failed:', err?.message ?? err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      // ignore
    }
  });
