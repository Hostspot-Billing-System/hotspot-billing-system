BEGIN;

-- Extend packages to support full "Bundle" model fields.
ALTER TABLE IF EXISTS packages
  ADD COLUMN IF NOT EXISTS description TEXT NULL;

ALTER TABLE IF EXISTS packages
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill for older rows (safe to re-run).
UPDATE packages
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

-- Keep updated_at current on edits.
CREATE OR REPLACE FUNCTION set_packages_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_packages_updated_at ON packages;
CREATE TRIGGER trg_set_packages_updated_at
BEFORE UPDATE ON packages
FOR EACH ROW
EXECUTE FUNCTION set_packages_updated_at();

COMMIT;
