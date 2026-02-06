-- Create login OTP storage (admin-only auth)
CREATE TABLE IF NOT EXISTS login_otps (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_otps_email_created_at
  ON login_otps (email, created_at DESC);
