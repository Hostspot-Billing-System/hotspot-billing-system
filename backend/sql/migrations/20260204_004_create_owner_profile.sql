BEGIN;

CREATE TABLE IF NOT EXISTS owner_profile (
  user_id          BIGINT PRIMARY KEY,
  username         TEXT NOT NULL DEFAULT 'Owner',
  email            TEXT NOT NULL DEFAULT '',
  phone_number     TEXT NOT NULL DEFAULT '',
  business_name    TEXT NOT NULL DEFAULT '',
  business_address TEXT NOT NULL DEFAULT '',

  -- Stored as a scrypt hash string. Never store plaintext.
  password_hash    TEXT NULL,

  account_status   TEXT NOT NULL DEFAULT 'Active',
  account_expires_at TIMESTAMPTZ NULL,
  commission_rate  NUMERIC(6,4) NOT NULL DEFAULT 0.06,
  member_since     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at    TIMESTAMPTZ NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_owner_profile_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_owner_profile_updated_at ON owner_profile;
CREATE TRIGGER trg_set_owner_profile_updated_at
BEFORE UPDATE ON owner_profile
FOR EACH ROW
EXECUTE FUNCTION set_owner_profile_updated_at();

COMMIT;
