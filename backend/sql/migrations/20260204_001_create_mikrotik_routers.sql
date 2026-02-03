-- Create MikroTik routers table (safe + idempotent)

CREATE TABLE IF NOT EXISTS mikrotik_routers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  api_port INTEGER DEFAULT 8728,
  winbox_port INTEGER DEFAULT 8291,
  web_port INTEGER DEFAULT 80,
  https_port INTEGER DEFAULT 443,
  status TEXT DEFAULT 'unknown',
  last_checked TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Optional metadata for UI; kept nullable and non-breaking.
ALTER TABLE mikrotik_routers ADD COLUMN IF NOT EXISTS description TEXT;
