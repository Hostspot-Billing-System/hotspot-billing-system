import { query } from '../config/db.js';

function parsePositiveInt(value, fieldName) {
  if (value == null || String(value).trim() === '') {
    throw new Error(`${fieldName} is required`);
  }
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  return Math.floor(n);
}

/**
 * Returns the current computed balance for an owner by summing ledger entries.
 *
 * Important: returns a NUMERIC(14,2) value as a string (e.g. "0.00") to avoid
 * precision loss from JS floating point.
 */
export async function getOwnerBalance(owner_id) {
  const ownerId = parsePositiveInt(owner_id, 'owner_id');

  const result = await query(
    `
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN direction = 'credit' THEN amount_ugx
            WHEN direction = 'debit' THEN -amount_ugx
            ELSE 0
          END
        ),
        0
      )::numeric(14,2) AS balance
    FROM ledger_entries
    WHERE owner_id = $1
    `,
    [ownerId]
  );

  const balance = result.rows?.[0]?.balance;
  return balance == null ? '0.00' : String(balance);
}
