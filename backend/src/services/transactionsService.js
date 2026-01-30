import { query } from '../config/db.js';

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

function parseOptionalNumber(value, fieldName) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    throw new DomainError('BAD_REQUEST', `${fieldName} must be a valid number`, 400);
  }
  return n;
}

function parseOptionalPositiveInt(value, fieldName, { defaultValue } = {}) {
  if (value == null || String(value).trim() === '') {
    if (defaultValue != null) return defaultValue;
    return null;
  }
  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new DomainError('BAD_REQUEST', `${fieldName} must be a valid number`, 400);
  }
  return Math.floor(n);
}

function parseOptionalDate(value, fieldName) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new DomainError('BAD_REQUEST', `${fieldName} must be a valid date`, 400);
  }
  return d;
}

function normalizeStatus(value) {
  const s = normalizeText(value);
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower !== 'pending' && lower !== 'completed' && lower !== 'failed') {
    throw new DomainError('BAD_REQUEST', `Invalid status: ${value}`, 400);
  }
  return lower;
}

function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function mapTransactionRow(row) {
  return {
    id: Number(row.id),
    reference: row.reference,
    customer_phone: row.customer_phone ?? null,
    bundle_name: row.bundle_name ?? null,
    amount_ugx: Number(row.amount_ugx ?? 0),
    commission_ugx: Number(row.commission_ugx ?? 0),
    net_amount_ugx: Number(row.net_amount_ugx ?? 0),
    status: row.status,
    payment_provider: row.payment_provider ?? 'NONE',
    created_at: toIso(row.created_at),
    paid_at: toIso(row.paid_at),
  };
}

function buildFilters({ search, status, bundle, fromDate, toDate, minAmount, maxAmount } = {}) {
  const conditions = [];
  const params = [];

  const q = normalizeText(search);
  if (q) {
    params.push(`%${q}%`);
    const idx = params.length;
    conditions.push(`(t.reference ILIKE $${idx} OR t.customer_phone ILIKE $${idx} OR t.bundle_name ILIKE $${idx})`);
  }

  const st = normalizeStatus(status);
  if (st) {
    params.push(st);
    conditions.push(`t.status = $${params.length}`);
  }

  const b = normalizeText(bundle);
  if (b) {
    params.push(b);
    conditions.push(`LOWER(t.bundle_name) = LOWER($${params.length})`);
  }

  const from = parseOptionalDate(fromDate, 'fromDate');
  if (from) {
    params.push(from.toISOString());
    conditions.push(`t.created_at >= $${params.length}::timestamptz`);
  }

  const to = parseOptionalDate(toDate, 'toDate');
  if (to) {
    params.push(to.toISOString());
    conditions.push(`t.created_at <= $${params.length}::timestamptz`);
  }

  const min = parseOptionalNumber(minAmount, 'minAmount');
  if (min != null) {
    params.push(min);
    conditions.push(`t.amount >= $${params.length}::numeric`);
  }

  const max = parseOptionalNumber(maxAmount, 'maxAmount');
  if (max != null) {
    params.push(max);
    conditions.push(`t.amount <= $${params.length}::numeric`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereSql, params };
}

export class TransactionsService {
  static async listTransactions(rawParams = {}) {
    const page = parseOptionalPositiveInt(rawParams.page, 'page', { defaultValue: 1 });
    const perPage = parseOptionalPositiveInt(rawParams.perPage, 'perPage', { defaultValue: 20 });
    const safePerPage = Math.min(100, Math.max(1, perPage));
    const offset = (page - 1) * safePerPage;

    const { whereSql, params } = buildFilters(rawParams);

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM transactions t
      ${whereSql}
      `,
      params
    );

    const total = countRes.rows?.[0]?.total ?? 0;
    const totalPages = total ? Math.ceil(total / safePerPage) : 0;

    const pagedParams = [...params, safePerPage, offset];
    const limitParam = pagedParams.length - 1;
    const offsetParam = pagedParams.length;

    const rowsRes = await query(
      `
      SELECT
        t.id,
        t.reference,
        t.customer_phone,
        t.bundle_name,
        t.amount::float8 AS amount_ugx,
        t.commission_amount::float8 AS commission_ugx,
        t.net_amount::float8 AS net_amount_ugx,
        t.status,
        t.payment_provider,
        t.created_at,
        t.paid_at
      FROM transactions t
      ${whereSql}
      ORDER BY t.created_at DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
      `,
      pagedParams
    );

    return {
      meta: {
        page,
        perPage: safePerPage,
        total,
        totalPages,
      },
      data: rowsRes.rows.map(mapTransactionRow),
    };
  }

  static async getTransactionById(id) {
    const txId = parseOptionalPositiveInt(id, 'id');
    if (!txId) {
      throw new DomainError('BAD_REQUEST', 'id must be a valid number', 400);
    }

    const result = await query(
      `
      SELECT
        t.id,
        t.reference,
        t.customer_phone,
        t.bundle_name,
        t.amount::float8 AS amount_ugx,
        t.commission_amount::float8 AS commission_ugx,
        t.net_amount::float8 AS net_amount_ugx,
        t.status,
        t.payment_provider,
        t.created_at,
        t.paid_at
      FROM transactions t
      WHERE t.id = $1
      `,
      [txId]
    );

    const row = result.rows[0] ?? null;
    if (!row) {
      throw new DomainError('NOT_FOUND', 'Transaction not found', 404);
    }

    return mapTransactionRow(row);
  }

  static async exportTransactions(rawParams = {}) {
    const { whereSql, params } = buildFilters(rawParams);

    const rowsRes = await query(
      `
      SELECT
        t.reference,
        t.customer_phone,
        t.bundle_name,
        t.amount::float8 AS amount_ugx,
        t.commission_amount::float8 AS commission_ugx,
        t.net_amount::float8 AS net_amount_ugx,
        t.status,
        t.payment_provider,
        t.created_at
      FROM transactions t
      ${whereSql}
      ORDER BY t.created_at DESC
      `,
      params
    );

    return rowsRes.rows.map((r) => ({
      date: toIso(r.created_at),
      reference: r.reference,
      phone: r.customer_phone ?? '',
      bundle: r.bundle_name ?? '',
      amount_ugx: Number(r.amount_ugx ?? 0),
      commission_ugx: Number(r.commission_ugx ?? 0),
      net_amount_ugx: Number(r.net_amount_ugx ?? 0),
      status: r.status,
      provider: r.payment_provider ?? 'NONE',
    }));
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

  // 42P01: undefined_table (migration not applied)
  if (err?.code === '42P01') {
    return {
      httpStatus: 500,
      body: {
        success: false,
        error: {
          code: 'SCHEMA_MISSING',
          message: "Database schema is missing (table 'transactions' not found). Apply migrations, then retry.",
        },
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
