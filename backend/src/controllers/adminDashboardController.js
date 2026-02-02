import { query } from '../config/db.js';
import { getSmsStatus } from '../services/smsStatusService.js';

function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function getAdminDashboardMetrics(req, res) {
  try {
    const result = await query(
      `
      WITH today_start AS (
        SELECT (date_trunc('day', timezone('Africa/Kampala', now())) AT TIME ZONE 'Africa/Kampala') AS ts
      )
      SELECT
        (
          SELECT COALESCE(SUM(t.amount_ugx), 0)::numeric(14,2)
          FROM transactions t
          WHERE t.status = 'completed'
            AND t.payment_method = 'MOBILE_MONEY'
            AND t.created_at >= (SELECT ts FROM today_start)
        ) AS today_revenue_ugx,

        (
          SELECT COUNT(*)::int
          FROM vouchers v
          WHERE v.status = 'available'
        ) AS voucher_stock_available,

        (
          SELECT COALESCE(SUM(COALESCE(w.net_amount, w.requested_amount, w.total_amount)), 0)::numeric(14,2)
          FROM withdrawals w
          WHERE w.status = 'completed'
        ) AS total_withdrawals_ugx,

        (
          SELECT COUNT(*)::int
          FROM transactions t
          WHERE t.status = 'failed'
            AND t.payment_method = 'MOBILE_MONEY'
            AND t.created_at >= (SELECT ts FROM today_start)
        ) AS failed_transactions_today
      `
    );

    const row = result.rows?.[0] ?? {};

    return res.status(200).json({
      today_revenue_ugx: row.today_revenue_ugx == null ? '0.00' : String(row.today_revenue_ugx),
      voucher_stock_available: Number(row.voucher_stock_available ?? 0),
      total_withdrawals_ugx: row.total_withdrawals_ugx == null ? '0.00' : String(row.total_withdrawals_ugx),
      failed_transactions_today: Number(row.failed_transactions_today ?? 0),
      sms_status: getSmsStatus(),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/dashboard/metrics failed:', err?.message ?? err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}

export async function getAdminDashboardRecentTransactions(req, res) {
  try {
    const result = await query(
      `
      SELECT
        t.created_at,
        t.reference,
        t.customer_phone,
        t.amount_ugx,
        t.status,
        t.failure_reason,
        COALESCE(t.bundle_name, p.name) AS bundle_name
      FROM transactions t
      LEFT JOIN packages p ON p.id = t.bundle_id
      WHERE t.payment_method = 'MOBILE_MONEY'
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 10
      `
    );

    const data = (result.rows ?? []).map((row) => ({
      date_time: toIso(row.created_at),
      reference: row.reference,
      customer_phone: row.customer_phone ?? null,
      amount_ugx: row.amount_ugx == null ? '0.00' : String(row.amount_ugx),
      status: row.status,
      bundle_name: row.bundle_name ?? null,
      reason: row.failure_reason ?? null,
    }));

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/dashboard/recent-transactions failed:', err?.message ?? err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}
