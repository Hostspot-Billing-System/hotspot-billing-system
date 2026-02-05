-- Migration: create ledger_entries table
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260131_007_create_ledger_entries.sql

BEGIN;

-- Enum types (created in a rerunnable way)
DO $$
BEGIN
  BEGIN
    CREATE TYPE ledger_source_type AS ENUM ('transaction', 'withdrawal', 'adjustment');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    CREATE TYPE ledger_direction AS ENUM ('credit', 'debit');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

CREATE TABLE IF NOT EXISTS ledger_entries (
  id            BIGSERIAL PRIMARY KEY,
  owner_id      BIGINT NOT NULL,
  source_type   ledger_source_type NOT NULL,
  source_id     BIGINT NOT NULL,
  direction     ledger_direction NOT NULL,
  amount_ugx    NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ledger_entries_amount_positive CHECK (amount_ugx > 0)
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_owner_id_created_at
  ON ledger_entries(owner_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_source_type_source_id
  ON ledger_entries(source_type, source_id);

COMMIT;
