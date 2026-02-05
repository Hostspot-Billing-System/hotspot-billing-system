import './env.js';
import pg from 'pg';

const { Pool } = pg;

function buildPoolConfigFromEnv() {
  const connectionString = process.env.DATABASE_URL ?? process.env.DATABASE_PUBLIC_URL;

  if (connectionString) {
    return {
      connectionString,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
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
