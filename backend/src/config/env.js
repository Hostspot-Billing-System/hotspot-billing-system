import dotenv from 'dotenv';

dotenv.config();

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function requireEnv(name) {
  const value = process.env[name];
  if (!hasValue(value)) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function ensureDbEnv() {
  // Prefer DATABASE_URL. Otherwise require discrete PG* variables.
  if (hasValue(process.env.DATABASE_URL)) return;

  requireEnv('PGHOST');
  requireEnv('PGPORT');
  requireEnv('PGUSER');
  requireEnv('PGPASSWORD');
  requireEnv('PGDATABASE');
}

// Validate minimal required env at startup.
// For Phase 1 we require DB configuration because backend is the source of truth.
ensureDbEnv();

export const env = {
  APP_ENV: process.env.APP_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: process.env.DATABASE_URL,
  PGHOST: process.env.PGHOST,
  PGPORT: process.env.PGPORT,
  PGUSER: process.env.PGUSER,
  PGPASSWORD: process.env.PGPASSWORD,
  PGDATABASE: process.env.PGDATABASE,
  PGSSL: process.env.PGSSL,
  // MikroTik (validated when used)
  MT_HOST: process.env.MT_HOST,
  MT_USER: process.env.MT_USER,
  MT_PASS: process.env.MT_PASS,
  MT_PORT: Number(process.env.MT_PORT ?? 8728),
  MT_TIMEOUT_MS: Number(process.env.MT_TIMEOUT_MS ?? 5000),
};
