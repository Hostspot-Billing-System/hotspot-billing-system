import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { pool } from '../config/db.js';

class DomainError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function normalizeCode(value) {
  return String(value ?? '').trim();
}

function pickCodeFromRow(row) {
  if (!row || typeof row !== 'object') return '';

  // Prefer explicit "code" header (case-insensitive)
  for (const key of Object.keys(row)) {
    if (String(key).trim().toLowerCase() === 'code') {
      return normalizeCode(row[key]);
    }
  }

  // Otherwise, take the first non-empty column value
  for (const key of Object.keys(row)) {
    const candidate = normalizeCode(row[key]);
    if (candidate) return candidate;
  }

  return '';
}

async function parseVoucherCodesFromCsvBuffer(buffer) {
  if (!buffer || buffer.length === 0) return [];

  const codes = [];
  const stream = Readable.from(buffer);

  await new Promise((resolve, reject) => {
    stream
      .pipe(csvParser({ separator: ',', skipLines: 0, strict: false }))
      .on('data', (row) => {
        const code = pickCodeFromRow(row);
        if (code) codes.push(code);
      })
      .on('error', reject)
      .on('end', resolve);
  });

  // csv-parser ignores blank lines; but for a plain "one code per line" file,
  // it might treat it as a single column. If no codes were found, try a fallback.
  if (codes.length === 0) {
    const text = buffer.toString('utf8');
    const fallback = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return fallback;
  }

  return codes;
}

export class VoucherUploadService {
  static async uploadCsv({ package_id, filename, fileBuffer }) {
    const packageId = Number(package_id);
    if (!Number.isFinite(packageId) || packageId <= 0) {
      throw new DomainError('BAD_REQUEST', 'package_id must be a valid number', 400);
    }

    if (!fileBuffer) {
      throw new DomainError('BAD_REQUEST', 'CSV file is required', 400);
    }

    const parsedCodes = await parseVoucherCodesFromCsvBuffer(fileBuffer);
    const normalizedCodes = parsedCodes.map(normalizeCode).filter(Boolean);

    if (normalizedCodes.length === 0) {
      throw new DomainError('BAD_REQUEST', 'No voucher codes found in CSV', 400);
    }

    // Reject duplicates within the CSV
    const seen = new Set();
    const duplicatesInCsv = new Set();
    for (const code of normalizedCodes) {
      if (seen.has(code)) duplicatesInCsv.add(code);
      seen.add(code);
    }
    if (duplicatesInCsv.size > 0) {
      throw new DomainError(
        'DUPLICATE_VOUCHERS_IN_CSV',
        `CSV contains duplicate voucher codes (example: ${Array.from(duplicatesInCsv)[0]})`,
        400
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Ensure package exists
      const pkg = await client.query('SELECT id FROM packages WHERE id = $1', [packageId]);
      if (pkg.rowCount !== 1) {
        throw new DomainError('PACKAGE_NOT_FOUND', 'Package not found', 404);
      }

      // Create batch record
      const batchResult = await client.query(
        `
        INSERT INTO voucher_batches (filename, package_id)
        VALUES ($1, $2)
        RETURNING id
        `,
        [filename ?? 'upload.csv', packageId]
      );
      const batchId = batchResult.rows[0].id;

      // Reject duplicates already in DB
      const existing = await client.query(
        'SELECT code FROM vouchers WHERE code = ANY($1::text[])',
        [normalizedCodes]
      );
      if (existing.rowCount > 0) {
        throw new DomainError(
          'DUPLICATE_VOUCHERS_IN_DB',
          `Some voucher codes already exist (example: ${existing.rows[0].code})`,
          409
        );
      }

      // Insert vouchers (transactional)
      const insertResult = await client.query(
        `
        INSERT INTO vouchers (code, package_id, status)
        SELECT code, $2, 'available'::voucher_status
        FROM unnest($1::text[]) AS code
        `,
        [normalizedCodes, packageId]
      );

      await client.query('COMMIT');

      return {
        batch_id: batchId,
        inserted: insertResult.rowCount ?? normalizedCodes.length,
      };
    } catch (err) {
      await client.query('ROLLBACK');

      // Handle unique-constraint race just in case
      if (err?.code === '23505') {
        throw new DomainError(
          'DUPLICATE_VOUCHERS_IN_DB',
          'Some voucher codes already exist',
          409
        );
      }

      throw err;
    } finally {
      client.release();
    }
  }
}

export function toHttpError(err) {
  if (err instanceof DomainError) {
    return {
      httpStatus: err.httpStatus,
      body: {
        success: false,
        error: { code: err.code, message: err.message },
      },
    };
  }

  return {
    httpStatus: 500,
    body: {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    },
  };
}
