import './env.js';
import pg from 'pg';

const { Pool } = pg;

function shouldEnableSsl(connectionString) {
  if (process.env.PGSSL === 'true') return true;
  if (!connectionString) return false;

  try {
    const url = new URL(connectionString);
    const sslMode = String(url.searchParams.get('sslmode') ?? '').toLowerCase();
    const host = String(url.hostname ?? '').toLowerCase();

    if (sslMode === 'require' || sslMode === 'verify-ca' || sslMode === 'verify-full') {
      return true;
    }

    return host.endsWith('.supabase.co') || host.endsWith('.pooler.supabase.com');
  } catch {
    return false;
  }
}

function buildPoolConfigFromEnv() {
  const connectionString = process.env.DATABASE_URL ?? process.env.DATABASE_PUBLIC_URL;
  const ssl = shouldEnableSsl(connectionString) ? { rejectUnauthorized: false } : undefined;

  if (connectionString) {
    return {
      connectionString,
      ssl,
    };
  }

  return {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}

export const pool = new Pool(buildPoolConfigFromEnv());

pool.on('error', (err) => {
  // This is a last-resort handler to avoid silent failures.
  console.error('Unexpected PostgreSQL pool error:', err);
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function checkDbConnection() {
  await pool.query('SELECT 1 AS ok');
}
