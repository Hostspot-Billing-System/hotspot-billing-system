import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import '../src/config/env.js';
import { pool } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyFile(relativePath) {
  const fullPath = path.resolve(__dirname, relativePath);
  const sql = await fs.readFile(fullPath, 'utf8');
  await pool.query(sql);
  // eslint-disable-next-line no-console
  console.log('Applied migration:', fullPath);
}

async function main() {
  try {
    await applyFile('../sql/migrations/20260131_004_create_withdrawals.sql');
    // eslint-disable-next-line no-console
    console.log('Withdrawals migrations applied successfully');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to apply withdrawals migrations:', err?.message ?? err);
  process.exit(1);
});
