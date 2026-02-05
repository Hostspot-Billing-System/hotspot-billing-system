-- Migration: create sms_logs table (audit trail for SMS attempts)
-- Run with: psql "<DATABASE_URL>" -f backend/sql/migrations/20260204_003_create_sms_logs.sql

BEGIN;

CREATE TABLE IF NOT EXISTS sms_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NULL,

  provider TEXT NOT NULL DEFAULT 'ugsms',
  purpose TEXT NULL,

  to_number TEXT NOT NULL,
  message TEXT NOT NULL,

  success BOOLEAN NOT NULL,
  http_status INT NULL,
  response_body TEXT NULL,
  error_message TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sms_logs_provider_valid CHECK (provider IN ('ugsms'))
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON sms_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_sms_logs_user_id ON sms_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_success ON sms_logs(success);

COMMIT;
