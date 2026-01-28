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

function getColumn(row, index) {
  if (!row) return undefined;
  if (Array.isArray(row)) return row[index];
  if (typeof row === 'object') {
    if (row[index] !== undefined) return row[index];
    const key = String(index);
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

function looksLikeMikrotikExportHeader(row) {
  const a = String(getColumn(row, 0) ?? '').trim().toLowerCase();
  const b = String(getColumn(row, 1) ?? '').trim().toLowerCase();
  const c = String(getColumn(row, 2) ?? '').trim().toLowerCase();
  const d = String(getColumn(row, 3) ?? '').trim().toLowerCase();
  const e = String(getColumn(row, 4) ?? '').trim().toLowerCase();
  const f = String(getColumn(row, 5) ?? '').trim().toLowerCase();

  // Common MikroTik exported CSV header
  return a === 'csv.' && b === 'password' && c === 'profile' && d === 'time limit' && e === 'data limit' && f === 'comment';
}

async function parseVouchersFromCsvBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    return { codes: [], batchLabel: null };
  }

  const codes = [];
  let batchLabel = null;
  let rowIndex = 0;

  const stream = Readable.from(buffer);
  const parser = csvParser({
    separator: ',',
    skipLines: 0,
    strict: false,
    headers: false,
  });

  await new Promise((resolve, reject) => {
    stream
      .pipe(parser)
      .on('data', (row) => {
        try {
          if (rowIndex === 0 && looksLikeMikrotikExportHeader(row)) {
            rowIndex += 1;
            return;
          }

          // SOURCE OF TRUTH:
          // Column A (index 0) is the voucher code.
          const voucherCode = String(getColumn(row, 0) || '').trim();
          if (!voucherCode) {
            throw new DomainError(
              'EMPTY_VOUCHER_CODE',
              'Empty voucher code in column A',
              400
            );
          }

          // Column E (index 4) is optional batch/campaign label.
          // Some CSV exporters include an empty "Data Limit" column at E and put the
          // campaign/comment in column F, so we accept F as a fallback.
          if (batchLabel == null) {
            const candidate = getColumn(row, 4);
            const fallback = getColumn(row, 5);
            const trimmed = candidate != null ? String(candidate).trim() : '';
            const trimmedFallback = fallback != null ? String(fallback).trim() : '';
            if (trimmed) batchLabel = trimmed;
            else if (trimmedFallback) batchLabel = trimmedFallback;
          }

          codes.push(voucherCode);
          rowIndex += 1;
        } catch (err) {
          parser.destroy(err);
        }
      })
      .on('error', reject)
      .on('end', resolve);
  });

  return { codes, batchLabel };
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

    const { codes: parsedCodes, batchLabel } = await parseVouchersFromCsvBuffer(fileBuffer);
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
        INSERT INTO voucher_batches (filename, package_id, description)
        VALUES ($1, $2, $3)
        RETURNING id
        `,
        [filename ?? 'upload.csv', packageId, batchLabel]
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
