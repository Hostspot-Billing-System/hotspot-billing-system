import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Always load the backend-local .env file regardless of where the process is started from.
// This avoids confusing situations where running from the repo root loads the wrong .env.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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
  if (hasValue(process.env.DATABASE_URL) || hasValue(process.env.DATABASE_PUBLIC_URL)) return;

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
  HOST: process.env.HOST ?? '0.0.0.0',
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: process.env.DATABASE_URL ?? process.env.DATABASE_PUBLIC_URL,
  PGHOST: process.env.PGHOST,
  PGPORT: process.env.PGPORT,
  PGUSER: process.env.PGUSER,
  PGPASSWORD: process.env.PGPASSWORD,
  PGDATABASE: process.env.PGDATABASE,
  PGSSL: process.env.PGSSL,
  // MikroTik (validated when used)
  MT_MODE: (process.env.MT_MODE ?? 'real').toLowerCase(),
  MIKROTIK_MOCK: String(process.env.MIKROTIK_MOCK ?? '').toLowerCase() === 'true',
  // Prefer explicit MikroTik env names, fall back to legacy MT_*.
  // Defaults are safe for common RouterOS v6 local networks.
  MT_HOST: process.env.MT_HOST ?? process.env.MIKROTIK_HOST ?? '10.5.50.1',
  MT_USER: process.env.MT_USER ?? process.env.MIKROTIK_USERNAME,
  MT_PASS: process.env.MT_PASS ?? process.env.MIKROTIK_PASSWORD,
  MT_PORT: Number(process.env.MT_PORT ?? process.env.MIKROTIK_PORT ?? 8728),
  MT_TIMEOUT_MS: Number(process.env.MT_TIMEOUT_MS ?? 5000),
};
