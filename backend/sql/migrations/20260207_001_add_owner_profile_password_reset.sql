BEGIN;

ALTER TABLE owner_profile
  ADD COLUMN IF NOT EXISTS reset_token TEXT NULL,
  ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_owner_profile_reset_token
  ON owner_profile (reset_token);

COMMIT;
