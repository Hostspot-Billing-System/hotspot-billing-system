import { query } from '../config/db.js';

function toMoneyString(value) {
  if (value == null) return '0.00';
  const s = String(value);
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toFixed(2);
}

export async function getAdminWithdrawalsSummary(req, res) {
  try {
    const result = await query(
      `
      SELECT
        (
          SELECT COALESCE(SUM(le.amount_ugx), 0)::numeric(14,2)
          FROM ledger_entries le
          WHERE le.direction = 'credit'
            AND le.source_type = 'transaction'
        ) AS total_earnings_ugx,

        (
          SELECT COALESCE(SUM(t.commission_amount), 0)::numeric(14,2)
          FROM transactions t
          WHERE t.status = 'completed'
        ) AS commission_ugx,

        (
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN le.direction = 'credit' THEN le.amount_ugx
                  WHEN le.direction = 'debit' THEN -le.amount_ugx
                  ELSE 0
                END
              ),
              0
            )::numeric(14,2)
          FROM ledger_entries le
        ) AS withdrawable_ugx,

        (
          SELECT COALESCE(SUM(COALESCE(w.requested_amount, w.net_amount, w.total_amount)), 0)::numeric(14,2)
          FROM withdrawals w
          WHERE w.status IN ('pending', 'approved', 'pending_otp', 'otp_pending', 'processing')
        ) AS pending_withdrawals_ugx
      `
    );

    const row = result.rows?.[0] ?? {};

    // For UI safety: return money as fixed-2dp strings.
    const totalEarnings = toMoneyString(row.total_earnings_ugx);
    const commission = toMoneyString(row.commission_ugx);
    const withdrawable = toMoneyString(row.withdrawable_ugx);
    const pendingWithdrawals = toMoneyString(row.pending_withdrawals_ugx);

    return res.status(200).json({
      success: true,
      total_earnings_ugx: totalEarnings,
      commission_ugx: commission,
      withdrawable_ugx: withdrawable,
      pending_withdrawals_ugx: pendingWithdrawals,

      // Backward-compatible aliases used by existing UI.
      commission_deducted_ugx: commission,
      withdrawable_amount_ugx: withdrawable,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('GET /api/admin/withdrawals/summary failed:', err?.message ?? err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}
