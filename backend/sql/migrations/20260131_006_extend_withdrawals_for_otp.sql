-- Migration: extend existing withdrawals table with OTP fields (non-destructive)

BEGIN;

ALTER TABLE IF EXISTS withdrawals
  ADD COLUMN IF NOT EXISTS requested_amount NUMERIC(12,2) NULL,
  ADD COLUMN IF NOT EXISTS payout_phone VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS verification_contact VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS otp_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL;

UPDATE withdrawals
SET updated_at = COALESCE(updated_at, created_at)
WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawals_client_id_status
  ON withdrawals (client_id, status);

CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at
  ON withdrawals (created_at);

CREATE OR REPLACE FUNCTION set_withdrawals_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_withdrawals_updated_at ON withdrawals;

CREATE TRIGGER trg_set_withdrawals_updated_at
BEFORE UPDATE ON withdrawals
FOR EACH ROW
EXECUTE FUNCTION set_withdrawals_updated_at();

COMMIT;
