import { pool } from '../config/db.js';

class DomainError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function normalizeText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function parseRequiredPositiveBigint(value, fieldName) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    throw new DomainError('BAD_REQUEST', `${fieldName} is required`, 400);
  }

  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) {
    throw new DomainError('BAD_REQUEST', `${fieldName} must be a valid number`, 400);
  }

  return Math.floor(num);
}

function parseRequiredMoney(value, fieldName) {
  if (value == null) {
    throw new DomainError('BAD_REQUEST', `${fieldName} is required`, 400);
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    throw new DomainError('BAD_REQUEST', `${fieldName} is required`, 400);
  }

  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new DomainError('BAD_REQUEST', `${fieldName} must be a valid non-negative number`, 400);
  }

  // Return a string to avoid floating rounding surprises.
  return amount.toFixed(2);
}

function generateReference() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `TXN-${ts}-${rand}`;
}

function isExpiredRow(voucherRow) {
  if (!voucherRow?.expires_at) return false;
  return new Date(voucherRow.expires_at).getTime() <= Date.now();
}

export class TransactionService {
  static async createTransaction({ voucher_code, bundle_id, customer_phone, amount_ugx, payment_method }) {
    const voucherCode = normalizeText(voucher_code);
    const bundleId = parseRequiredPositiveBigint(bundle_id, 'bundle_id');
    const customerPhone = normalizeText(customer_phone);
    const paymentMethod = normalizeText(payment_method);
    const amountUgx = parseRequiredMoney(amount_ugx, 'amount_ugx');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (voucherCode) {
        const voucherRes = await client.query(
          `
          SELECT id, code, status, expires_at, used_at
          FROM vouchers
          WHERE code = $1
          FOR UPDATE
          `,
          [voucherCode]
        );

        const voucher = voucherRes.rows[0] ?? null;
        if (!voucher) {
          throw new DomainError('VOUCHER_NOT_FOUND', 'Voucher not found', 404);
        }

        if (voucher.status === 'used') {
          throw new DomainError('VOUCHER_ALREADY_USED', 'Voucher already used', 409);
        }

        if (voucher.status === 'expired' || isExpiredRow(voucher)) {
          throw new DomainError('VOUCHER_EXPIRED', 'Voucher is expired', 409);
        }

        const updateRes = await client.query(
          `
          UPDATE vouchers
          SET status = 'used'::voucher_status, used_at = NOW()
          WHERE id = $1
            AND status = 'available'::voucher_status
            AND (expires_at IS NULL OR expires_at >= NOW())
          RETURNING id
          `,
          [voucher.id]
        );

        if (updateRes.rowCount !== 1) {
          throw new DomainError('VOUCHER_EXPIRED', 'Voucher cannot be used', 409);
        }
      }

      // Insert transaction with a unique reference, retrying safely on collisions.
      let transactionRow = null;
      let reference = generateReference();

      await client.query('SAVEPOINT create_transaction_insert');

      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const insertRes = await client.query(
            `
            INSERT INTO transactions (
              reference,
              voucher_code,
              bundle_id,
              customer_phone,
              amount_ugx,
              commission_ugx,
              status,
              payment_method
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5::numeric(12,2),
              ROUND(($5::numeric(12,2) * 0.06), 2),
              'completed',
              $6
            )
            RETURNING
              id,
              reference,
              voucher_code,
              bundle_id,
              customer_phone,
              amount_ugx,
              commission_ugx,
              status,
              payment_method,
              created_at
            `,
            [reference, voucherCode, bundleId, customerPhone, amountUgx, paymentMethod]
          );

          transactionRow = insertRes.rows[0];
          break;
        } catch (err) {
          // 23505: unique_violation
          if (err?.code === '23505') {
            await client.query('ROLLBACK TO SAVEPOINT create_transaction_insert');
            reference = generateReference();
            continue;
          }
          throw err;
        }
      }

      if (!transactionRow) {
        throw new DomainError('REFERENCE_GENERATION_FAILED', 'Failed to generate transaction reference', 500);
      }

      await client.query('COMMIT');
      return transactionRow;
    } catch (err) {
      await client.query('ROLLBACK');

      // Map common database errors into stable domain errors.
      // 23503: foreign_key_violation
      if (err?.code === '23503') {
        throw new DomainError('BUNDLE_NOT_FOUND', 'bundle_id does not exist', 400);
      }

      throw err;
    } finally {
      client.release();
    }
  }

  static async listTransactions({
    status,
    bundle_id,
    date_from,
    date_to,
    search,
    page = 1,
    limit = 20,
  } = {}) {
    const normalizedStatus = normalizeText(status);
    if (normalizedStatus && normalizedStatus !== 'completed' && normalizedStatus !== 'failed') {
      throw new DomainError('BAD_REQUEST', `Invalid status: ${status}`, 400);
    }

    const conditions = [];
    const params = [];

    if (normalizedStatus) {
      params.push(normalizedStatus);
      conditions.push(`t.status = $${params.length}`);
    }

    if (bundle_id != null && String(bundle_id).trim() !== '') {
      const bundleId = parseRequiredPositiveBigint(bundle_id, 'bundle_id');
      params.push(bundleId);
      conditions.push(`t.bundle_id = $${params.length}`);
    }

    const fromRaw = normalizeText(date_from);
    if (fromRaw) {
      const from = new Date(fromRaw);
      if (Number.isNaN(from.getTime())) {
        throw new DomainError('BAD_REQUEST', 'date_from must be a valid date', 400);
      }
      params.push(from.toISOString());
      conditions.push(`t.created_at >= $${params.length}::timestamptz`);
    }

    const toRaw = normalizeText(date_to);
    if (toRaw) {
      const to = new Date(toRaw);
      if (Number.isNaN(to.getTime())) {
        throw new DomainError('BAD_REQUEST', 'date_to must be a valid date', 400);
      }
      params.push(to.toISOString());
      conditions.push(`t.created_at <= $${params.length}::timestamptz`);
    }

    const q = normalizeText(search);
    if (q) {
      params.push(`%${q}%`);
      const idx = params.length;
      conditions.push(`(t.reference ILIKE $${idx} OR t.customer_phone ILIKE $${idx})`);
    }

    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
    const offset = (safePage - 1) * safeLimit;

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM transactions t
      ${whereSql}
      `,
      params
    );

    const total = countRes.rows?.[0]?.total ?? 0;

    params.push(safeLimit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const rowsRes = await pool.query(
      `
      SELECT
        t.id,
        t.reference,
        t.voucher_code,
        t.bundle_id,
        t.customer_phone,
        t.amount_ugx,
        t.commission_ugx,
        t.status,
        t.payment_method,
        t.created_at
      FROM transactions t
      ${whereSql}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
      `,
      params
    );

    return {
      page: safePage,
      limit: safeLimit,
      total,
      total_pages: total ? Math.ceil(total / safeLimit) : 0,
      data: rowsRes.rows,
    };
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
