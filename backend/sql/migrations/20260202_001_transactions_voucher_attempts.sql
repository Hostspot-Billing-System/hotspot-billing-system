-- Migration: support voucher-attempt transactions
-- - Allow status 'success'
-- - Allow bundle_id to be NULL so invalid voucher attempts can still be logged
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260202_001_transactions_voucher_attempts.sql

BEGIN;

-- 1) Make bundle_id nullable (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'bundle_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE transactions ALTER COLUMN bundle_id DROP NOT NULL;
  END IF;
END $$;

-- 2) Expand status constraint to allow 'success' (keep existing values for backward compatibility)
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_status_valid;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_status_valid
  CHECK (status IN ('pending', 'completed', 'success', 'failed'));

-- 3) Helpful index for portal voucher lookups
CREATE INDEX IF NOT EXISTS idx_transactions_voucher_code ON transactions(voucher_code);

COMMIT;
