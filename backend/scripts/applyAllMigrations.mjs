import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import '../src/config/env.js';
import { pool } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applySqlFile(relativePath) {
  const fullPath = path.resolve(__dirname, relativePath);
  const sql = await fs.readFile(fullPath, 'utf8');
  await pool.query(sql);
  console.log('Applied:', fullPath);
}

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

async function columnExists(tableName, columnName) {
  const result = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = $3
    ) AS exists
    `,
    ['public', tableName, columnName]
  );
  return Boolean(result.rows?.[0]?.exists);
}

async function main() {
  await applySqlFile('../sql/schema.sql');
  await applySqlFile('../sql/migrations/20260131_001_create_transactions.sql');
  await applySqlFile('../sql/migrations/20260131_002_extend_transactions_mysql_fields.sql');
  await applySqlFile('../sql/migrations/20260131_004_create_withdrawals.sql');

  if (!(await tableExists('ledger_entries'))) {
    await applySqlFile('../sql/migrations/20260131_007_create_ledger_entries.sql');
  }

  if (await tableExists('withdrawals')) {
    if (!(await columnExists('withdrawals', 'idempotency_key'))) {
      await applySqlFile('../sql/migrations/20260131_008_add_withdrawals_idempotency_key.sql');
    }

    if (
      !(await columnExists('withdrawals', 'otp_attempts')) ||
      !(await columnExists('withdrawals', 'otp_locked_until'))
    ) {
      await applySqlFile('../sql/migrations/20260131_009_add_withdrawals_otp_attempt_tracking.sql');
    }
  }

  await applySqlFile('../sql/migrations/20260202_001_add_packages_price_ugx_and_seed_official.sql');
  await applySqlFile('../sql/migrations/20260202_001_transactions_voucher_attempts.sql');
  await applySqlFile('../sql/migrations/20260203_001_extend_packages_for_bundles.sql');
  await applySqlFile('../sql/migrations/20260203_002_add_packages_deleted_at.sql');
  await applySqlFile('../sql/migrations/20260203_003_add_vouchers_used_by.sql');
  await applySqlFile('../sql/migrations/20260203_004_add_transactions_source_and_voucher_id.sql');
  await applySqlFile('../sql/migrations/20260204_001_create_mikrotik_routers.sql');
  await applySqlFile('../sql/migrations/20260204_002_create_sms_settings.sql');
  await applySqlFile('../sql/migrations/20260204_003_create_sms_logs.sql');
  await applySqlFile('../sql/migrations/20260204_004_create_owner_profile.sql');
  await applySqlFile('../sql/migrations/20260205_001_add_flutterwave_fields_to_transactions.sql');
  await applySqlFile('../sql/migrations/20260205_002_transactions_bundle_fk_set_null.sql');
  await applySqlFile('../sql/migrations/20260205_003_add_transactions_sms_status_provider.sql');
  await applySqlFile('../sql/migrations/20260206_001_create_login_otps.sql');
  await applySqlFile('../sql/migrations/20260207_001_add_owner_profile_password_reset.sql');

  console.log('All database migrations applied successfully.');
}

main()
  .catch((err) => {
    console.error('applyAllMigrations failed:', err?.message ?? err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      // ignore
    }
  });
