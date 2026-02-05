-- Migration: create OTP-based withdrawals table
-- Note: This migration creates a new `withdrawals` table with OTP verification fields.

BEGIN;

-- Create enum type safely (PostgreSQL has no CREATE TYPE IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'withdrawal_status') THEN
    CREATE TYPE withdrawal_status AS ENUM ('pending_otp', 'processing', 'completed', 'failed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS withdrawals (
  id BIGSERIAL PRIMARY KEY,
  client_id BIGINT NOT NULL,

  requested_amount NUMERIC(12,2) NOT NULL,
  commission_amount NUMERIC(12,2) NOT NULL,
  net_amount NUMERIC(12,2) NOT NULL,

  payout_phone VARCHAR(20) NOT NULL,
  verification_contact VARCHAR(50) NOT NULL,

  otp_hash TEXT NOT NULL,
  otp_expires_at TIMESTAMPTZ NOT NULL,

  status withdrawal_status NOT NULL DEFAULT 'pending_otp',
  failure_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
