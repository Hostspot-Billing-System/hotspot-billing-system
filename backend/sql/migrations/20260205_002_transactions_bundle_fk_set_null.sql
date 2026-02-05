-- Migration: allow deleting packages without breaking transactions history
-- Changes transactions.bundle_id FK to ON DELETE SET NULL
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260205_002_transactions_bundle_fk_set_null.sql

BEGIN;

-- Ensure bundle_id is nullable (required for SET NULL)
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

-- Replace the FK constraint (idempotent)
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_bundle_id_fkey;

DO $$
BEGIN
  -- Add FK as NOT VALID first so the migration can succeed even if older data
  -- already contains orphaned bundle_id references.
  BEGIN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_bundle_id_fkey
      FOREIGN KEY (bundle_id)
      REFERENCES packages(id)
      ON DELETE SET NULL
      NOT VALID;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
  END;

  -- Try to validate; if it fails, keep NOT VALID but still enforce for new rows.
  BEGIN
    ALTER TABLE transactions VALIDATE CONSTRAINT transactions_bundle_id_fkey;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Could not validate transactions_bundle_id_fkey; leaving as NOT VALID. Error: %', SQLERRM;
  END;
END $$;

COMMIT;
