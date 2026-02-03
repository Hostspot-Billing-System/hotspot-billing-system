import '../src/config/env.js';
import { pool } from '../src/config/db.js';

async function main() {
  const name = (process.argv[2] ?? 'Monthly').trim();
  const sql = `
    SELECT id, name, is_active, deleted_at, created_at, updated_at
    FROM packages
    WHERE name = $1
    ORDER BY id DESC
  `;

  const r = await pool.query(sql, [name]);
  console.log(JSON.stringify({ name, count: r.rows.length, rows: r.rows }, null, 2));
}

main()
  .catch((err) => {
    console.error('debugBundleByName failed:', err?.message ?? err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch {
      // ignore
    }
  });
