-- Migration: create transactions table
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260131_001_create_transactions.sql

BEGIN;

CREATE TABLE IF NOT EXISTS transactions (
  id             BIGSERIAL PRIMARY KEY,
  reference      TEXT NOT NULL,
  voucher_code   TEXT NULL,
  bundle_id      BIGINT NOT NULL,
  customer_phone TEXT NULL,
  amount_ugx     NUMERIC(12,2) NULL,
  commission_ugx NUMERIC(12,2) NULL,
  status         TEXT NOT NULL,
  payment_method TEXT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT transactions_reference_unique UNIQUE (reference),
  CONSTRAINT transactions_status_valid CHECK (status IN ('completed', 'failed'))
);

-- Add FK separately to keep the migration re-runnable and “FK-safe”.
-- Treat `bundle_id` as the referenced package/bundle.
DO $$
BEGIN
  BEGIN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_bundle_id_fkey
      FOREIGN KEY (bundle_id) REFERENCES packages(id) ON DELETE RESTRICT;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
  END;
END $$;

-- Helpful indexes for common filters
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_bundle_id ON transactions(bundle_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_phone ON transactions(customer_phone);

COMMIT;
