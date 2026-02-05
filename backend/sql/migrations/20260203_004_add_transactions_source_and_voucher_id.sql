-- Migration: add transactions.source and transactions.voucher_id for auditability
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260203_004_add_transactions_source_and_voucher_id.sql

BEGIN;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS source TEXT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS voucher_id BIGINT NULL;

-- Optional FK for better integrity (safe / rerunnable)
DO $$
BEGIN
  BEGIN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_voucher_id_fkey
      FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source);
CREATE INDEX IF NOT EXISTS idx_transactions_voucher_id ON transactions(voucher_id);

COMMIT;
