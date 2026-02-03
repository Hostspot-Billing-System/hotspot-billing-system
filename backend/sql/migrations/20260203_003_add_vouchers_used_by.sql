-- Migration: add vouchers.used_by to support admin direct sales attribution
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260203_003_add_vouchers_used_by.sql

BEGIN;

ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS used_by TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_vouchers_used_by ON vouchers(used_by);

COMMIT;
