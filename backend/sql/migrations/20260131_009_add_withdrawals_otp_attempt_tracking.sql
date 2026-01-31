-- Migration: add OTP attempt tracking to withdrawals
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260131_009_add_withdrawals_otp_attempt_tracking.sql

BEGIN;

ALTER TABLE IF EXISTS withdrawals
  ADD COLUMN IF NOT EXISTS otp_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_locked_until TIMESTAMPTZ NULL;

COMMIT;
