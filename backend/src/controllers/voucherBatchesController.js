import { VoucherBatchesService } from '../services/voucherBatchesService.js';

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildPagination(req) {
  const page = parsePositiveInt(req.query?.page, 1);
  const limit = clampInt(parsePositiveInt(req.query?.limit, 25), 1, 200);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export async function listVoucherBatches(req, res) {
  try {
    console.info('GET /api/voucher-batches');
    const rows = await VoucherBatchesService.listBatches();

    return res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}

export async function listVouchersForBatch(req, res) {
  try {
    const batchId = Number(req.params?.id);
    if (!Number.isFinite(batchId) || batchId <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid batch id' },
      });
    }

    console.info('GET /api/voucher-batches/:id/vouchers', { batchId });
    const { page, limit, offset } = buildPagination(req);

    const countResult = await query(
      `
      SELECT COUNT(*)::int AS total
      FROM vouchers v
      WHERE v.batch_id = $1
      `,
      [batchId]
    );
    const total = countResult.rows?.[0]?.total ?? 0;

    const result = await query(
      `
      SELECT
        v.id,
        v.code,
        v.status,
        p.name AS package_name,
        v.batch_id,
        v.created_at,
        v.used_at
      FROM vouchers v
      JOIN packages p ON p.id = v.package_id
      WHERE v.batch_id = $1
      ORDER BY v.created_at DESC, v.id DESC
      LIMIT $2 OFFSET $3
      `,
      [batchId, limit, offset]
    );

    return res.status(200).json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}
