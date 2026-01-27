-- Wi-Fi Hotspot Billing System (Phase 1)
-- PostgreSQL schema: packages, vouchers, voucher_batches, hotspot_sessions
-- Apply with: psql "<DATABASE_URL>" -f backend/sql/schema.sql

BEGIN;

-- 1) Types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'voucher_status') THEN
    CREATE TYPE voucher_status AS ENUM ('available', 'used', 'expired');
  END IF;
END $$;

-- 2) Tables
CREATE TABLE IF NOT EXISTS packages (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  mikrotik_profile TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT packages_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS voucher_batches (
  id          BIGSERIAL PRIMARY KEY,
  filename    TEXT NOT NULL,
  package_id  BIGINT NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  label       TEXT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backward-safe migration for existing DBs
ALTER TABLE IF EXISTS voucher_batches
  ADD COLUMN IF NOT EXISTS label TEXT NULL;

CREATE TABLE IF NOT EXISTS vouchers (
  id         BIGSERIAL PRIMARY KEY,
  code       TEXT NOT NULL,
  package_id BIGINT NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  status     voucher_status NOT NULL DEFAULT 'available',
  expires_at TIMESTAMPTZ NULL,
  used_at    TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vouchers_code_unique UNIQUE (code),
  CONSTRAINT vouchers_used_at_required_when_used CHECK (
    (status <> 'used' AND used_at IS NULL)
    OR (status = 'used' AND used_at IS NOT NULL)
  ),
  CONSTRAINT vouchers_expiry_sane CHECK (
    expires_at IS NULL OR expires_at > created_at
  )
);

CREATE TABLE IF NOT EXISTS hotspot_sessions (
  id         BIGSERIAL PRIMARY KEY,
  voucher_id BIGINT NOT NULL REFERENCES vouchers(id) ON DELETE RESTRICT,
  mac_address TEXT NOT NULL,
  ip_address  INET NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT hotspot_sessions_end_after_start CHECK (
    ended_at IS NULL OR ended_at >= started_at
  )
);

-- 3) Indexes
-- Vouchers: fast lookup by code + status filtering
-- (Unique constraint on code creates an index, but we keep explicit status/package indexes)
CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_package_id ON vouchers(package_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_expires_at ON vouchers(expires_at);

-- Optional: speed up "available vouchers" queries
CREATE INDEX IF NOT EXISTS idx_vouchers_available ON vouchers(code)
  WHERE status = 'available';

-- Sessions: common access patterns are by voucher and time
CREATE INDEX IF NOT EXISTS idx_sessions_voucher_id ON hotspot_sessions(voucher_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON hotspot_sessions(started_at);

COMMIT;
