-- Migration: add Flutterwave fields to transactions for mobile money reconciliation
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260205_001_add_flutterwave_fields_to_transactions.sql

BEGIN;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS flutterwave_tx_ref TEXT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS flutterwave_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_flutterwave_tx_ref ON transactions(flutterwave_tx_ref);
CREATE INDEX IF NOT EXISTS idx_transactions_flutterwave_id ON transactions(flutterwave_id);

COMMIT;
