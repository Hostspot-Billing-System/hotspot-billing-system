import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import '../src/config/env.js';
import { pool } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function applySqlFile(relativePath) {
  const fullPath = path.resolve(__dirname, relativePath);
  const sql = await fs.readFile(fullPath, 'utf8');
  await pool.query(sql);
  console.log('Applied:', fullPath);
}

async function applySqlInline(label, sql) {
  await pool.query(sql);
  console.log('Applied:', label);
}

async function main() {
  // 1) Ensure portal_sessions exists (base schema drift)
  if (!(await tableExists('portal_sessions'))) {
    await applySqlInline(
      'create portal_sessions table',
      `
      BEGIN;

      CREATE TABLE IF NOT EXISTS portal_sessions (
        id          BIGSERIAL PRIMARY KEY,
        mac_address TEXT NOT NULL,
        ip_address  INET NOT NULL,
        interface   TEXT NULL,
        router_id   TEXT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT portal_sessions_mac_ip_unique UNIQUE (mac_address, ip_address)
      );

      CREATE INDEX IF NOT EXISTS idx_portal_sessions_mac ON portal_sessions(mac_address);
      CREATE INDEX IF NOT EXISTS idx_portal_sessions_updated_at ON portal_sessions(updated_at);

      COMMIT;
      `
    );
  } else {
    // Make sure required columns exist if table existed already.
    const required = ['mac_address', 'ip_address', 'interface', 'router_id', 'created_at', 'updated_at'];
    for (const col of required) {
      if (!(await columnExists('portal_sessions', col))) {
        throw new Error(`portal_sessions exists but is missing required column: ${col}`);
      }
    }
  }

  // 2) ledger_entries is required by withdrawals flow.
  if (!(await tableExists('ledger_entries'))) {
    await applySqlFile('../sql/migrations/20260131_007_create_ledger_entries.sql');
  }

  // 3) withdrawals: ensure OTP attempt tracking + idempotency are present.
  if (await tableExists('withdrawals')) {
    const needsIdempotency = !(await columnExists('withdrawals', 'idempotency_key'));
    const needsOtpAttempts = !(await columnExists('withdrawals', 'otp_attempts'));
    const needsOtpLockedUntil = !(await columnExists('withdrawals', 'otp_locked_until'));

    if (needsIdempotency) {
      await applySqlFile('../sql/migrations/20260131_008_add_withdrawals_idempotency_key.sql');
    }

    if (needsOtpAttempts || needsOtpLockedUntil) {
      await applySqlFile('../sql/migrations/20260131_009_add_withdrawals_otp_attempt_tracking.sql');
    }
  } else {
    console.warn("Table 'withdrawals' not found. Skipping withdrawals migrations.");
  }

  // NOTE: We intentionally do NOT apply 20260131_005_create_withdrawals_otp.sql.
  // That migration defines an enum-based schema that can conflict with the current
  // varchar-based withdrawals.status used by the code.

  console.log('Missing migrations check: done');
}

main()
  .catch((err) => {
    console.error('applyMissingMigrations failed:', err?.message ?? err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      // ignore
    }
  });
