-- Migration: add sms_status and sms_provider to transactions
-- Safe addition used by portal SMS integration.

BEGIN;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS sms_status TEXT NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS sms_provider TEXT NULL;

COMMIT;
