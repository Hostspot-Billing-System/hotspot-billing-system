import { TransactionService, toHttpError } from '../services/transactionService.js';

function normalizeText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function parseOptionalPositiveInt(value, fieldName) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, code: 'BAD_REQUEST', message: `${fieldName} must be a valid number` };
  }
  return { ok: true, value: Math.floor(n) };
}

export async function createTransaction(req, res) {
  try {
    console.info('POST /api/transactions');

    const body = req.body ?? {};

    const bundle_id = body.bundle_id;
    const amount_ugx = body.amount_ugx;

    const voucher_code = normalizeText(body.voucher_code);
    const customer_phone = normalizeText(body.customer_phone);
    const payment_method = normalizeText(body.payment_method);

    if (bundle_id == null || String(bundle_id).trim() === '') {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'bundle_id is required' },
      });
    }

    if (amount_ugx == null || String(amount_ugx).trim() === '') {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'amount_ugx is required' },
      });
    }

    if (!payment_method) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'payment_method is required' },
      });
    }

    const created = await TransactionService.createTransaction({
      voucher_code,
      bundle_id,
      customer_phone,
      amount_ugx,
      payment_method,
    });

    return res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    // Friendly message if migration not applied.
    if (err?.code === '42P01') {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SCHEMA_MISSING',
          message: "Database schema is missing (table 'transactions' not found). Apply the transactions migration, then retry.",
        },
      });
    }

    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}

export async function listTransactions(req, res) {
  try {
    console.info('GET /api/transactions');

    const status = normalizeText(req.query?.status);

    const bundle_id = normalizeText(req.query?.bundle_id ?? req.query?.bundleId);

    const date_from =
      normalizeText(req.query?.date_from) ??
      normalizeText(req.query?.from) ??
      normalizeText(req.query?.start_date) ??
      normalizeText(req.query?.start);

    const date_to =
      normalizeText(req.query?.date_to) ??
      normalizeText(req.query?.to) ??
      normalizeText(req.query?.end_date) ??
      normalizeText(req.query?.end);

    const search = normalizeText(req.query?.search ?? req.query?.q);

    const pageParsed = parseOptionalPositiveInt(req.query?.page, 'page');
    if (pageParsed && !pageParsed.ok) {
      return res.status(400).json({
        success: false,
        error: { code: pageParsed.code, message: pageParsed.message },
      });
    }

    const limitParsed = parseOptionalPositiveInt(req.query?.limit, 'limit');
    if (limitParsed && !limitParsed.ok) {
      return res.status(400).json({
        success: false,
        error: { code: limitParsed.code, message: limitParsed.message },
      });
    }

    const result = await TransactionService.listTransactions({
      status,
      bundle_id,
      date_from,
      date_to,
      search,
      page: pageParsed?.value ?? 1,
      limit: limitParsed?.value ?? 20,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    if (err?.code === '42P01') {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SCHEMA_MISSING',
          message: "Database schema is missing (table 'transactions' not found). Apply the transactions migration, then retry.",
        },
      });
    }

    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}
