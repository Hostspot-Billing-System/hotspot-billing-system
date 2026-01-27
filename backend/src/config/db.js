import pg from 'pg';

const { Pool } = pg;

function buildPoolConfigFromEnv() {
  const connectionString = process.env.DATABASE_URL;

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

export async function seedDefaultPackagesIfEmpty() {
  let count = 0;
  try {
    const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM packages');
    count = countResult.rows?.[0]?.count ?? 0;
  } catch (err) {
    // 42P01: undefined_table
    if (err?.code === '42P01') {
      throw new Error(
        "Database schema is missing (table 'packages' not found). Apply backend/sql/schema.sql, then restart the backend."
      );
    }
    throw err;
  }

  if (count > 0) return;

  await pool.query(
    `
    INSERT INTO packages (id, name, duration_minutes, mikrotik_profile)
    VALUES
      (1, '2 Hours Unlimited', 120, '2h-unlimited'),
      (2, 'Daily Plan', 1440, 'daily-plan')
    ON CONFLICT (name) DO NOTHING
    `
  );

  // Keep the BIGSERIAL sequence in sync with our explicit ids.
  await pool.query("SELECT setval(pg_get_serial_sequence('packages','id'), 2, true)");
}
