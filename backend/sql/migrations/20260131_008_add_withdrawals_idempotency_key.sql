-- Migration: add idempotency_key to withdrawals
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260131_008_add_withdrawals_idempotency_key.sql

BEGIN;

ALTER TABLE IF EXISTS withdrawals
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL;

-- Unique constraint (nullable) to guarantee idempotency per key.
DO $$
BEGIN
  BEGIN
    ALTER TABLE withdrawals
      ADD CONSTRAINT withdrawals_idempotency_key_unique UNIQUE (idempotency_key);
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;
