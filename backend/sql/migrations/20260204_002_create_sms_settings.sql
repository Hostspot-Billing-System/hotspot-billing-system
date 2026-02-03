-- Migration: create sms_settings table (per-user SMS provider configuration)
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260204_002_create_sms_settings.sql

BEGIN;

CREATE TABLE IF NOT EXISTS sms_settings (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,

  provider TEXT NOT NULL DEFAULT 'ugsms',
  api_username TEXT NULL,
  api_password_encrypted TEXT NULL,
  sender_id TEXT NULL,
  use_custom_api BOOLEAN NOT NULL DEFAULT FALSE,

  login_otp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  withdrawal_otp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  customer_voucher_sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sms_settings_user_unique UNIQUE (user_id),
  CONSTRAINT sms_settings_provider_valid CHECK (provider IN ('ugsms'))
);

CREATE INDEX IF NOT EXISTS idx_sms_settings_user_id ON sms_settings(user_id);

-- Keep sms_settings.updated_at current on edits.
CREATE OR REPLACE FUNCTION set_sms_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sms_settings_updated_at ON sms_settings;
CREATE TRIGGER trg_set_sms_settings_updated_at
BEFORE UPDATE ON sms_settings
FOR EACH ROW
EXECUTE FUNCTION set_sms_settings_updated_at();

COMMIT;
