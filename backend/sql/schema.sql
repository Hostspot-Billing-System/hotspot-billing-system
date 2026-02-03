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
  price_ugx         INTEGER NULL,
  description      TEXT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ NULL,

  CONSTRAINT packages_name_unique UNIQUE (name)
);

-- Keep packages.updated_at current on edits.
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

CREATE TABLE IF NOT EXISTS voucher_batches (
  id          BIGSERIAL PRIMARY KEY,
  filename    TEXT NOT NULL,
  package_id  BIGINT NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  -- Backward compatible fields:
  -- Some phases used `label`, later phases use `description`.
  label       TEXT NULL,
  description TEXT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backward-safe migration for existing DBs
ALTER TABLE IF EXISTS voucher_batches
  ADD COLUMN IF NOT EXISTS label TEXT NULL;

ALTER TABLE IF EXISTS voucher_batches
  ADD COLUMN IF NOT EXISTS description TEXT NULL;

CREATE TABLE IF NOT EXISTS vouchers (
  id         BIGSERIAL PRIMARY KEY,
  code       TEXT NOT NULL,
  package_id BIGINT NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  batch_id   BIGINT NULL,
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

-- Backward-safe migration for existing DBs
ALTER TABLE IF EXISTS vouchers
  ADD COLUMN IF NOT EXISTS batch_id BIGINT NULL;

-- Add FK separately to avoid failures in older DBs during column creation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'vouchers' AND column_name = 'batch_id'
  ) THEN
    BEGIN
      ALTER TABLE vouchers
        ADD CONSTRAINT vouchers_batch_id_fkey
        FOREIGN KEY (batch_id) REFERENCES voucher_batches(id) ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN
        -- Constraint already exists
        NULL;
    END;
  END IF;
END $$;

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
CREATE INDEX IF NOT EXISTS idx_vouchers_batch_id ON vouchers(batch_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_expires_at ON vouchers(expires_at);

-- Optional: speed up "available vouchers" queries
CREATE INDEX IF NOT EXISTS idx_vouchers_available ON vouchers(code)
  WHERE status = 'available';

-- Sessions: common access patterns are by voucher and time
CREATE INDEX IF NOT EXISTS idx_sessions_voucher_id ON hotspot_sessions(voucher_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON hotspot_sessions(started_at);

-- Captive portal sessions: lightweight, short-lived records for portal bootstrapping.
-- Safe to call multiple times; idempotent by (mac_address, ip_address).
CREATE TABLE IF NOT EXISTS portal_sessions (
  id          BIGSERIAL PRIMARY KEY,
  mac_address TEXT NOT NULL,
  ip_address  INET NOT NULL,
  interface   TEXT NULL,
  router_id   TEXT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT portal_sessions_mac_ip_unique UNIQUE (mac_address, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_mac ON portal_sessions(mac_address);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_updated_at ON portal_sessions(updated_at);

-- Auto-assign vouchers.batch_id during CSV upload without changing app code.
-- When a voucher is inserted with a NULL batch_id, attach it to the most recent
-- voucher_batches row for the same package_id visible in the current transaction.
CREATE OR REPLACE FUNCTION set_voucher_batch_id_if_missing()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.batch_id IS NULL THEN
    SELECT vb.id
    INTO NEW.batch_id
    FROM voucher_batches vb
    WHERE vb.package_id = NEW.package_id
    ORDER BY vb.created_at DESC, vb.id DESC
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_voucher_batch_id_if_missing ON vouchers;
CREATE TRIGGER trg_set_voucher_batch_id_if_missing
BEFORE INSERT ON vouchers
FOR EACH ROW
EXECUTE FUNCTION set_voucher_batch_id_if_missing();

-- One-time backfill for older rows (safe to re-run):
-- Attach vouchers with NULL batch_id to the most recent batch for the same package
-- created at or before the voucher's created_at.
UPDATE vouchers v
SET batch_id = (
  SELECT vb.id
  FROM voucher_batches vb
  WHERE vb.package_id = v.package_id
    AND vb.created_at <= v.created_at
  ORDER BY vb.created_at DESC, vb.id DESC
  LIMIT 1
)
WHERE v.batch_id IS NULL;

COMMIT;
