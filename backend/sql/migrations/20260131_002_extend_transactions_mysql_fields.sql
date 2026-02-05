-- Migration: extend existing Postgres transactions table with additional fields
-- (MySQL-style schema adaptation, additive + backward compatible)
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260131_002_extend_transactions_mysql_fields.sql

BEGIN;

-- 1) Enum types (Postgres)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_provider_enum') THEN
    CREATE TYPE payment_provider_enum AS ENUM ('MTN', 'AIRTEL', 'NONE');
  END IF;
END $$;

-- 2) Columns (additive)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS bundle_name VARCHAR(100) NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_provider payment_provider_enum NOT NULL DEFAULT 'NONE';

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(255) NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS agent_id BIGINT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS client_id BIGINT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL;

-- Financials (generated columns to keep data consistent with existing *_ugx columns)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2)
    GENERATED ALWAYS AS (amount_ugx) STORED;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2)
    GENERATED ALWAYS AS (COALESCE(commission_ugx, 0)) STORED;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2)
    GENERATED ALWAYS AS (
      CASE
        WHEN amount_ugx IS NULL THEN NULL
        ELSE (amount_ugx - COALESCE(commission_ugx, 0))
      END
    ) STORED;

-- 3) Expand existing status constraint to allow 'pending' (keeps existing text column)
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_status_valid;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_status_valid CHECK (status IN ('pending', 'completed', 'failed'));

-- 4) Backfills for existing rows (safe to re-run)
UPDATE transactions t
SET bundle_name = p.name
FROM packages p
WHERE p.id = t.bundle_id
  AND t.bundle_name IS NULL;

UPDATE transactions
SET updated_at = COALESCE(updated_at, created_at)
WHERE updated_at IS NULL;

UPDATE transactions
SET paid_at = COALESCE(paid_at, created_at)
WHERE paid_at IS NULL
  AND status = 'completed';

-- 5) Optional: tighten NOT NULL only if currently safe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'transactions'
      AND column_name = 'customer_phone'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM transactions WHERE customer_phone IS NULL) THEN
      ALTER TABLE transactions ALTER COLUMN customer_phone SET NOT NULL;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'transactions'
      AND column_name = 'bundle_name'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM transactions WHERE bundle_name IS NULL) THEN
      ALTER TABLE transactions ALTER COLUMN bundle_name SET NOT NULL;
    END IF;
  END IF;
END $$;

-- 6) Keep bundle_name + updated_at in sync going forward (transactions table only)
CREATE OR REPLACE FUNCTION set_transactions_bundle_name_and_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.bundle_name IS NULL THEN
    SELECT p.name
    INTO NEW.bundle_name
    FROM packages p
    WHERE p.id = NEW.bundle_id;
  END IF;

  NEW.updated_at = NOW();

  IF NEW.paid_at IS NULL AND NEW.status = 'completed' THEN
    NEW.paid_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_transactions_bundle_name_and_updated_at ON transactions;
CREATE TRIGGER trg_set_transactions_bundle_name_and_updated_at
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION set_transactions_bundle_name_and_updated_at();

COMMIT;
