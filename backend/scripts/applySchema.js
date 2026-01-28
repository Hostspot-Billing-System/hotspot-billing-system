import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import '../src/config/env.js';
import { pool } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const schemaPath = path.resolve(__dirname, '../sql/schema.sql');
  const sql = await fs.readFile(schemaPath, 'utf8');

  try {
    await pool.query(sql);
    // eslint-disable-next-line no-console
    console.log('Schema applied successfully:', schemaPath);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to apply schema:', err?.message ?? err);
  process.exit(1);
});
