import { TransactionService } from '../services/transactionService.js';
import { TransactionsService, toHttpError as toHttpErrorTransactions } from '../services/transactionsService.js';

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
    const { httpStatus, body } = toHttpErrorTransactions(err);
    return res.status(httpStatus).json(body);
  }
}

export async function listTransactions(req, res) {
  try {
    // Accept spec params + backward-compatible aliases used by earlier UI.
    const params = {
      search: normalizeText(req.query?.search ?? req.query?.q),
      status: normalizeText(req.query?.status),
      bundle: normalizeText(req.query?.bundle ?? req.query?.bundle_name ?? req.query?.bundleName),
      fromDate:
        normalizeText(req.query?.fromDate) ??
        normalizeText(req.query?.date_from) ??
        normalizeText(req.query?.from) ??
        normalizeText(req.query?.start_date) ??
        normalizeText(req.query?.start),
      toDate:
        normalizeText(req.query?.toDate) ??
        normalizeText(req.query?.date_to) ??
        normalizeText(req.query?.to) ??
        normalizeText(req.query?.end_date) ??
        normalizeText(req.query?.end),
      minAmount: normalizeText(req.query?.minAmount ?? req.query?.min_amount),
      maxAmount: normalizeText(req.query?.maxAmount ?? req.query?.max_amount),
      page: req.query?.page,
      perPage: req.query?.perPage ?? req.query?.per_page ?? req.query?.perpage ?? req.query?.limit,
    };

    const result = await TransactionsService.listTransactions(params);
    return res.status(200).json({
      success: true,
      meta: result.meta,
      data: result.data,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpErrorTransactions(err);
    return res.status(httpStatus).json(body);
  }
}

function csvEscape(value) {
  if (value == null) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

export async function exportTransactions(req, res) {
  try {
    const params = {
      search: normalizeText(req.query?.search ?? req.query?.q),
      status: normalizeText(req.query?.status),
      bundle: normalizeText(req.query?.bundle ?? req.query?.bundle_name ?? req.query?.bundleName),
      fromDate:
        normalizeText(req.query?.fromDate) ??
        normalizeText(req.query?.date_from) ??
        normalizeText(req.query?.from) ??
        normalizeText(req.query?.start_date) ??
        normalizeText(req.query?.start),
      toDate:
        normalizeText(req.query?.toDate) ??
        normalizeText(req.query?.date_to) ??
        normalizeText(req.query?.to) ??
        normalizeText(req.query?.end_date) ??
        normalizeText(req.query?.end),
      minAmount: normalizeText(req.query?.minAmount ?? req.query?.min_amount),
      maxAmount: normalizeText(req.query?.maxAmount ?? req.query?.max_amount),
    };

    const rows = await TransactionsService.exportTransactions(params);

    const header = [
      'Date',
      'Reference',
      'Phone',
      'Bundle',
      'Amount (UGX)',
      'Commission (UGX)',
      'Net Amount (UGX)',
      'Status',
      'Provider',
    ];

    const lines = [header.join(',')];
    for (const row of rows) {
      lines.push(
        [
          csvEscape(row.date),
          csvEscape(row.reference),
          csvEscape(row.phone),
          csvEscape(row.bundle),
          csvEscape(row.amount_ugx),
          csvEscape(row.commission_ugx),
          csvEscape(row.net_amount_ugx),
          csvEscape(row.status),
          csvEscape(row.provider),
        ].join(',')
      );
    }

    const csv = `${lines.join('\n')}\n`;
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `transactions_export_${dateStamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (err) {
    const { httpStatus, body } = toHttpErrorTransactions(err);
    return res.status(httpStatus).json(body);
  }
}

export async function getTransactionById(req, res) {
  try {
    const id = req.params?.id;
    const tx = await TransactionsService.getTransactionById(id);
    return res.status(200).json({ success: true, data: tx });
  } catch (err) {
    const { httpStatus, body } = toHttpErrorTransactions(err);
    return res.status(httpStatus).json(body);
  }
}
