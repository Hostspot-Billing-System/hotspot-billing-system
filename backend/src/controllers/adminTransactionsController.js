import { query } from '../config/db.js';

function normalizeText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function parseOptionalPositiveInt(value, fieldName, { defaultValue } = {}) {
  if (value == null || String(value).trim() === '') {
    if (defaultValue != null) return defaultValue;
    return null;
  }

  const n = Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0) {
    const err = new Error(`${fieldName} must be a valid number`);
    err.code = 'BAD_REQUEST';
    err.httpStatus = 400;
    throw err;
  }

  return Math.floor(n);
}

function parseOptionalNumber(value, fieldName) {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n)) {
    const err = new Error(`${fieldName} must be a valid number`);
    err.code = 'BAD_REQUEST';
    err.httpStatus = 400;
    throw err;
  }
  return n;
}

function parseOptionalDate(value, fieldName) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const err = new Error(`${fieldName} must be a valid date`);
    err.code = 'BAD_REQUEST';
    err.httpStatus = 400;
    throw err;
  }
  return d;
}

function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toHttpError(err) {
  const httpStatus = Number(err?.httpStatus) || (err?.code === 'BAD_REQUEST' ? 400 : 500);
  if (httpStatus === 400) {
    return {
      httpStatus,
      body: { error: { code: 'BAD_REQUEST', message: err?.message ?? 'Bad request' } },
    };
  }

  return {
    httpStatus: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
  };
}

export async function listAdminTransactions(req, res) {
  try {
    const q = normalizeText(req.query?.q);
    const status = normalizeText(req.query?.status);
    const bundleIdRaw = normalizeText(req.query?.bundle_id);

    const minAmount = parseOptionalNumber(req.query?.min_amount, 'min_amount');
    const maxAmount = parseOptionalNumber(req.query?.max_amount, 'max_amount');

    const fromDate = parseOptionalDate(req.query?.from_date, 'from_date');
    const toDate = parseOptionalDate(req.query?.to_date, 'to_date');

    const page = parseOptionalPositiveInt(req.query?.page, 'page', { defaultValue: 1 });
    const perPage = parseOptionalPositiveInt(req.query?.per_page, 'per_page', { defaultValue: 20 });
    const safePerPage = Math.min(100, Math.max(1, perPage));
    const offset = (page - 1) * safePerPage;

    const conditions = [];
    const params = [];

    // Strict rule: admin transactions represent mobile money only.
    conditions.push(`UPPER(COALESCE(t.payment_method, '')) = 'MOBILE_MONEY'`);

    if (q) {
      params.push(`%${q}%`);
      const idx = params.length;
      conditions.push(
        `(t.reference ILIKE $${idx} OR t.customer_phone ILIKE $${idx} OR COALESCE(t.bundle_name, p.name) ILIKE $${idx})`
      );
    }

    if (status) {
      const s = status.toLowerCase();
      if (s !== 'pending' && s !== 'success' && s !== 'completed' && s !== 'failed') {
        const err = new Error('status must be one of: pending, success, failed');
        err.code = 'BAD_REQUEST';
        err.httpStatus = 400;
        throw err;
      }

      if (s === 'success') {
        // API uses 'success' but DB stores 'completed'.
        conditions.push(`t.status = 'completed'`);
      } else {
        params.push(s);
        conditions.push(`t.status = $${params.length}`);
      }
    }

    if (bundleIdRaw) {
      const n = Number(bundleIdRaw);
      if (!Number.isFinite(n) || n <= 0) {
        const err = new Error('bundle_id must be a valid number');
        err.code = 'BAD_REQUEST';
        err.httpStatus = 400;
        throw err;
      }

      params.push(Math.floor(n));
      conditions.push(`t.bundle_id = $${params.length}::bigint`);
    }

    if (minAmount != null) {
      params.push(minAmount);
      conditions.push(`t.amount_ugx >= $${params.length}::numeric`);
    }

    if (maxAmount != null) {
      params.push(maxAmount);
      conditions.push(`t.amount_ugx <= $${params.length}::numeric`);
    }

    if (fromDate) {
      params.push(fromDate.toISOString());
      conditions.push(`t.created_at >= $${params.length}::timestamptz`);
    }

    if (toDate) {
      params.push(toDate.toISOString());
      conditions.push(`t.created_at <= $${params.length}::timestamptz`);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM transactions t
      LEFT JOIN packages p ON p.id = t.bundle_id
      ${whereSql}
      `,
      params
    );

    const total = countRes.rows?.[0]?.total ?? 0;

    const pagedParams = [...params, safePerPage, offset];
    const limitParam = pagedParams.length - 1;
    const offsetParam = pagedParams.length;

    const rowsRes = await query(
      `
      SELECT
        t.id,
        t.reference,
        t.customer_phone,
        t.bundle_id,
        COALESCE(t.bundle_name, p.name) AS bundle_name,
        t.amount_ugx::float8 AS amount_ugx,
        t.status,
        t.payment_method,
        t.payment_provider,
        t.created_at,
        t.paid_at
      FROM transactions t
      LEFT JOIN packages p ON p.id = t.bundle_id
      ${whereSql}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
      `,
      pagedParams
    );

    const data = (rowsRes.rows ?? []).map((row) => ({
      id: Number(row.id),
      reference: row.reference,
      customer_phone: row.customer_phone ?? null,
      bundle_id: row.bundle_id == null ? null : Number(row.bundle_id),
      bundle_name: row.bundle_name ?? null,
      amount_ugx: Number(row.amount_ugx ?? 0),
      status: String(row.status ?? '').toLowerCase() === 'completed' ? 'success' : row.status,
      payment_method: row.payment_method ?? null,
      payment_provider: row.payment_provider ?? 'NONE',
      created_at: toIso(row.created_at),
      paid_at: toIso(row.paid_at),
    }));

    return res.status(200).json({
      data,
      meta: {
        page,
        per_page: safePerPage,
        total,
      },
    });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    // eslint-disable-next-line no-console
    if (httpStatus >= 500) console.error('GET /api/admin/transactions failed:', err?.message ?? err);
    return res.status(httpStatus).json(body);
  }
}
