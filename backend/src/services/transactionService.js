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

function parseOptionalPositiveBigint(value, fieldName) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const num = Number(trimmed);
  if (!Number.isFinite(num) || num <= 0) {
    throw new DomainError('BAD_REQUEST', `${fieldName} must be a valid number`, 400);
  }

  return Math.floor(num);
}

async function lockOwnerLedgerAndGetBalance(client, ownerId) {
  // Serialize ledger writes per owner even if there are no ledger rows yet.
  await client.query('SELECT pg_advisory_xact_lock($1::bigint) AS locked', [ownerId]);

  const result = await client.query(
    `
    SELECT
      COALESCE(le.balance_after, 0)::numeric(14,2) AS balance
    FROM (SELECT 1) x
    LEFT JOIN LATERAL (
      SELECT balance_after
      FROM ledger_entries
      WHERE owner_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE
    ) le ON true
    `,
    [ownerId]
  );

  const row = result.rows?.[0] ?? null;
  return { balance: row?.balance == null ? '0.00' : String(row.balance) };
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

function buildTransactionsFilters({ status, bundle_id, date_from, date_to, search } = {}) {
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

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereSql, params };
}

export class TransactionService {
  static async getTransactionById(id) {
    const txId = parseRequiredPositiveBigint(id, 'id');

    const result = await pool.query(
      `
      SELECT
        t.id,
        t.reference,
        t.voucher_code,
        t.bundle_id,
        p.name AS bundle_name,
        t.customer_phone,
        t.amount_ugx,
        t.commission_ugx,
        t.status,
        t.payment_method,
        t.created_at
      FROM transactions t
      JOIN packages p ON p.id = t.bundle_id
      WHERE t.id = $1
      `,
      [txId]
    );

    const row = result.rows[0] ?? null;
    if (!row) {
      throw new DomainError('TRANSACTION_NOT_FOUND', 'Transaction not found', 404);
    }

    return row;
  }

  static async createTransaction({ voucher_code, bundle_id, customer_phone, amount_ugx, payment_method, client_id } = {}) {
    const voucherCode = normalizeText(voucher_code);
    const bundleId = parseRequiredPositiveBigint(bundle_id, 'bundle_id');
    const customerPhone = normalizeText(customer_phone);
    const paymentMethod = normalizeText(payment_method);
    const amountUgx = parseRequiredMoney(amount_ugx, 'amount_ugx');
    const ownerId = parseOptionalPositiveBigint(client_id, 'client_id');

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
              payment_method,
              client_id,
              paid_at
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5::numeric(12,2),
              ROUND(($5::numeric(12,2) * 0.06), 2),
              'completed',
              $6,
              $7,
              NOW()
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
            [reference, voucherCode, bundleId, customerPhone, amountUgx, paymentMethod, ownerId]
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

      // Write ledger credit only when the transaction is recorded as 'completed'.
      // This happens atomically within this same DB transaction.
      if (ownerId) {
        const { balance } = await lockOwnerLedgerAndGetBalance(client, ownerId);
        const netRes = await client.query(
          `
          SELECT ($1::numeric(12,2) - ROUND(($1::numeric(12,2) * 0.06), 2))::numeric(14,2) AS net_credit
          `,
          [amountUgx]
        );
        const netCredit = String(netRes.rows?.[0]?.net_credit ?? '0.00');

        await client.query(
          `
          INSERT INTO ledger_entries (
            owner_id,
            source_type,
            source_id,
            direction,
            amount_ugx,
            balance_after
          )
          VALUES (
            $1,
            'transaction',
            $2,
            'credit',
            $3::numeric(14,2),
            ($4::numeric(14,2) + $3::numeric(14,2))::numeric(14,2)
          )
          `,
          [ownerId, transactionRow.id, netCredit, balance]
        );
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
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
    const offset = (safePage - 1) * safeLimit;

    const { whereSql, params } = buildTransactionsFilters({ status, bundle_id, date_from, date_to, search });

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

  static async listTransactionsExport({ status, bundle_id, date_from, date_to, search } = {}) {
    const { whereSql, params } = buildTransactionsFilters({ status, bundle_id, date_from, date_to, search });

    const result = await pool.query(
      `
      SELECT
        t.reference,
        t.customer_phone AS phone,
        p.name AS bundle,
        t.amount_ugx AS amount,
        t.commission_ugx AS commission,
        t.status,
        t.created_at
      FROM transactions t
      JOIN packages p ON p.id = t.bundle_id
      ${whereSql}
      ORDER BY t.created_at DESC, t.id DESC
      `,
      params
    );

    return result.rows;
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
