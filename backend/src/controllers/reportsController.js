import { query } from '../config/db.js';

const COMMISSION_RATE = 0.06;

function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

function toDateOnlyStringUTC(d) {
  const iso = d.toISOString();
  return iso.slice(0, 10);
}

function isValidDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

function parseDateRange(req) {
  const startRaw = req.query?.start_date;
  const endRaw = req.query?.end_date;

  const now = new Date();
  const defaultEnd = toDateOnlyStringUTC(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 29);
  const defaultStart = toDateOnlyStringUTC(start);

  const start_date = hasValue(startRaw) ? String(startRaw).trim() : defaultStart;
  const end_date = hasValue(endRaw) ? String(endRaw).trim() : defaultEnd;

  if (!isValidDateOnly(start_date) || !isValidDateOnly(end_date)) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'start_date and end_date must be YYYY-MM-DD' },
    };
  }

  if (start_date > end_date) {
    return {
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'start_date must be <= end_date' },
    };
  }

  return { ok: true, start_date, end_date };
}

function num(value) {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function int(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function toUgxMoneyNumber(value) {
  // Keep 2dp to match stored NUMERIC(12,2)
  return Math.round(num(value) * 100) / 100;
}

function isSuccessStatusSql() {
  // Keep in one place so all reports share the same definition.
  return "status IN ('completed','success')";
}

export async function getReportsSummary(req, res) {
  const range = parseDateRange(req);
  if (!range.ok) return res.status(400).json({ success: false, error: range.error });

  const { start_date, end_date } = range;

  const result = await query(
    `
    WITH success AS (
      SELECT
        amount_ugx,
        commission_ugx,
        customer_phone
      FROM transactions
      WHERE payment_method = 'mobile_money'
        AND ${isSuccessStatusSql()}
        AND created_at >= $1::date
        AND created_at < ($2::date + INTERVAL '1 day')
    )
    SELECT
      COALESCE(SUM(amount_ugx), 0) AS total_revenue_ugx,
      COUNT(*)::int AS successful_transactions,
      COALESCE(SUM(COALESCE(commission_ugx, amount_ugx * $3::numeric)), 0) AS total_commission_ugx,
      CASE WHEN COUNT(*) = 0 THEN 0 ELSE COALESCE(SUM(amount_ugx), 0) / COUNT(*) END AS average_transaction_ugx,
      COUNT(DISTINCT customer_phone)::int AS unique_customers
    FROM success
    `,
    [start_date, end_date, COMMISSION_RATE]
  );

  const row = result.rows?.[0] ?? {};

  return res.status(200).json({
    success: true,
    data: {
      start_date,
      end_date,
      commission_rate: COMMISSION_RATE,
      total_revenue_ugx: toUgxMoneyNumber(row.total_revenue_ugx),
      successful_transactions: int(row.successful_transactions),
      total_commission_ugx: toUgxMoneyNumber(row.total_commission_ugx),
      average_transaction_ugx: toUgxMoneyNumber(row.average_transaction_ugx),
      unique_customers: int(row.unique_customers),
    },
  });
}

export async function getDailyRevenue(req, res) {
  const range = parseDateRange(req);
  if (!range.ok) return res.status(400).json({ success: false, error: range.error });

  const { start_date, end_date } = range;

  const result = await query(
    `
    WITH days AS (
      SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS day
    ),
    agg AS (
      SELECT
        date_trunc('day', created_at)::date AS day,
        COALESCE(SUM(amount_ugx), 0) AS revenue_ugx,
        COUNT(*)::int AS transactions
      FROM transactions
      WHERE payment_method = 'mobile_money'
        AND ${isSuccessStatusSql()}
        AND created_at >= $1::date
        AND created_at < ($2::date + INTERVAL '1 day')
      GROUP BY 1
    )
    SELECT
      d.day::text AS day,
      COALESCE(a.revenue_ugx, 0) AS revenue_ugx,
      COALESCE(a.transactions, 0)::int AS transactions
    FROM days d
    LEFT JOIN agg a ON a.day = d.day
    ORDER BY d.day ASC
    `,
    [start_date, end_date]
  );

  const rows = (result.rows ?? []).map((r) => ({
    day: String(r.day),
    revenue_ugx: toUgxMoneyNumber(r.revenue_ugx),
    transactions: int(r.transactions),
  }));

  return res.status(200).json({ success: true, data: { start_date, end_date, rows } });
}

export async function getBundlePerformance(req, res) {
  const range = parseDateRange(req);
  if (!range.ok) return res.status(400).json({ success: false, error: range.error });

  const { start_date, end_date } = range;

  const result = await query(
    `
    SELECT
      COALESCE(p.name, t.bundle_name, 'Unknown') AS bundle_name,
      COALESCE(SUM(t.amount_ugx), 0) AS revenue_ugx,
      COUNT(*)::int AS sales,
      COALESCE(SUM(COALESCE(t.commission_ugx, t.amount_ugx * $3::numeric)), 0) AS commission_ugx
    FROM transactions t
    LEFT JOIN packages p ON p.id = t.bundle_id
    WHERE t.payment_method = 'mobile_money'
      AND ${isSuccessStatusSql()}
      AND t.created_at >= $1::date
      AND t.created_at < ($2::date + INTERVAL '1 day')
    GROUP BY 1
    ORDER BY revenue_ugx DESC, sales DESC, bundle_name ASC
    `,
    [start_date, end_date, COMMISSION_RATE]
  );

  const rows = (result.rows ?? []).map((r) => ({
    bundle_name: String(r.bundle_name ?? 'Unknown'),
    revenue_ugx: toUgxMoneyNumber(r.revenue_ugx),
    sales: int(r.sales),
    commission_ugx: toUgxMoneyNumber(r.commission_ugx),
  }));

  return res.status(200).json({ success: true, data: { start_date, end_date, commission_rate: COMMISSION_RATE, rows } });
}

export async function getHourlySales(req, res) {
  const range = parseDateRange(req);
  if (!range.ok) return res.status(400).json({ success: false, error: range.error });

  const { start_date, end_date } = range;

  const result = await query(
    `
    WITH hours AS (
      SELECT generate_series(0, 23)::int AS hour
    ),
    agg AS (
      SELECT
        EXTRACT(HOUR FROM created_at)::int AS hour,
        COUNT(*)::int AS transactions
      FROM transactions
      WHERE payment_method = 'mobile_money'
        AND ${isSuccessStatusSql()}
        AND created_at >= $1::date
        AND created_at < ($2::date + INTERVAL '1 day')
      GROUP BY 1
    )
    SELECT
      h.hour::int AS hour,
      COALESCE(a.transactions, 0)::int AS transactions
    FROM hours h
    LEFT JOIN agg a ON a.hour = h.hour
    ORDER BY h.hour ASC
    `,
    [start_date, end_date]
  );

  const rows = (result.rows ?? []).map((r) => ({
    hour: int(r.hour),
    transactions: int(r.transactions),
  }));

  return res.status(200).json({ success: true, data: { start_date, end_date, rows } });
}

export async function getPaymentMethods(req, res) {
  const range = parseDateRange(req);
  if (!range.ok) return res.status(400).json({ success: false, error: range.error });

  const { start_date, end_date } = range;

  const result = await query(
    `
    SELECT
      payment_method,
      COUNT(*)::int AS transactions,
      COALESCE(SUM(amount_ugx), 0) AS revenue_ugx
    FROM transactions
    WHERE payment_method IS NOT NULL
      AND payment_method = 'mobile_money'
      AND ${isSuccessStatusSql()}
      AND created_at >= $1::date
      AND created_at < ($2::date + INTERVAL '1 day')
    GROUP BY payment_method
    ORDER BY transactions DESC, payment_method ASC
    `,
    [start_date, end_date]
  );

  const rows = (result.rows ?? []).map((r) => ({
    payment_method: String(r.payment_method),
    transactions: int(r.transactions),
    revenue_ugx: toUgxMoneyNumber(r.revenue_ugx),
  }));

  return res.status(200).json({ success: true, data: { start_date, end_date, rows } });
}

export async function getVoucherStats(req, res) {
  const range = parseDateRange(req);
  if (!range.ok) return res.status(400).json({ success: false, error: range.error });

  const { start_date, end_date } = range;

  const result = await query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE v.status = 'used')::int AS used,
      COUNT(*) FILTER (
        WHERE v.status = 'available'
          AND (v.expires_at IS NULL OR v.expires_at >= NOW())
      )::int AS available
    FROM vouchers v
    WHERE v.created_at >= $1::date
      AND v.created_at < ($2::date + INTERVAL '1 day')
    `,
    [start_date, end_date]
  );

  const row = result.rows?.[0] ?? {};

  return res.status(200).json({
    success: true,
    data: {
      start_date,
      end_date,
      total: int(row.total),
      used: int(row.used),
      available: int(row.available),
    },
  });
}

export async function getVoucherDistributionByBundle(req, res) {
  const range = parseDateRange(req);
  if (!range.ok) return res.status(400).json({ success: false, error: range.error });

  const { start_date, end_date } = range;

  const hasDeletedAt = await query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'packages'
      AND column_name = 'deleted_at'
    LIMIT 1
    `
  );

  const packagesWhere = hasDeletedAt.rows?.[0] ? 'WHERE p.deleted_at IS NULL' : '';

  const result = await query(
    `
    SELECT
      p.name AS bundle_name,
      COUNT(v.id)::int AS total,
      COUNT(v.id) FILTER (WHERE v.status = 'used')::int AS used,
      COUNT(v.id) FILTER (
        WHERE v.status = 'available'
          AND (v.expires_at IS NULL OR v.expires_at >= NOW())
      )::int AS available
    FROM packages p
    LEFT JOIN vouchers v
      ON v.package_id = p.id
      AND v.created_at >= $1::date
      AND v.created_at < ($2::date + INTERVAL '1 day')
    ${packagesWhere}
    GROUP BY p.name
    HAVING COUNT(v.id) > 0
    ORDER BY total DESC, bundle_name ASC
    `,
    [start_date, end_date]
  );

  const rows = (result.rows ?? []).map((r) => {
    const total = int(r.total);
    const used = int(r.used);
    const available = int(r.available);
    const usagePct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;

    return {
      bundle_name: String(r.bundle_name),
      total,
      used,
      available,
      usage_pct: usagePct,
    };
  });

  return res.status(200).json({ success: true, data: { start_date, end_date, rows } });
}

export async function getRecentVoucherUsage(req, res) {
  const range = parseDateRange(req);
  if (!range.ok) return res.status(400).json({ success: false, error: range.error });

  const { start_date, end_date } = range;

  const hasUsedBy = await query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vouchers'
      AND column_name = 'used_by'
    LIMIT 1
    `
  );

  const usedBySelect = hasUsedBy.rows?.[0] ? 'v.used_by' : 'NULL::text AS used_by';

  const result = await query(
    `
    SELECT
      v.code AS voucher_code,
      p.name AS bundle_name,
      ${usedBySelect},
      v.used_at
    FROM vouchers v
    JOIN packages p ON p.id = v.package_id
    WHERE v.status = 'used'
      AND v.used_at IS NOT NULL
      AND v.used_at >= $1::date
      AND v.used_at < ($2::date + INTERVAL '1 day')
    ORDER BY v.used_at DESC
    LIMIT 10
    `,
    [start_date, end_date]
  );

  const rows = (result.rows ?? []).map((r) => ({
    voucher_code: String(r.voucher_code ?? ''),
    bundle_name: String(r.bundle_name ?? ''),
    used_by: r.used_by == null ? null : String(r.used_by),
    used_at: r.used_at ? new Date(r.used_at).toISOString() : null,
  }));

  return res.status(200).json({ success: true, data: { start_date, end_date, rows } });
}

export async function getBundlePerformanceDetails(req, res) {
  const range = parseDateRange(req);
  if (!range.ok) return res.status(400).json({ success: false, error: range.error });

  const { start_date, end_date } = range;

  const result = await query(
    `
    SELECT
      COALESCE(p.name, t.bundle_name, 'Unknown') AS bundle_name,
      COUNT(*)::int AS total_sales,
      COALESCE(SUM(t.amount_ugx), 0) AS revenue_ugx,
      COALESCE(SUM(COALESCE(t.commission_ugx, t.amount_ugx * $3::numeric)), 0) AS commission_ugx,
      CASE WHEN COUNT(*) = 0 THEN 0 ELSE COALESCE(SUM(t.amount_ugx), 0) / COUNT(*) END AS avg_sale_ugx
    FROM transactions t
    LEFT JOIN packages p ON p.id = t.bundle_id
    WHERE t.payment_method = 'mobile_money'
      AND ${isSuccessStatusSql()}
      AND t.created_at >= $1::date
      AND t.created_at < ($2::date + INTERVAL '1 day')
    GROUP BY 1
    ORDER BY revenue_ugx DESC, total_sales DESC, bundle_name ASC
    `,
    [start_date, end_date, COMMISSION_RATE]
  );

  const rows = (result.rows ?? []).map((r) => ({
    bundle_name: String(r.bundle_name ?? 'Unknown'),
    total_sales: int(r.total_sales),
    revenue_ugx: toUgxMoneyNumber(r.revenue_ugx),
    commission_ugx: toUgxMoneyNumber(r.commission_ugx),
    avg_sale_ugx: toUgxMoneyNumber(r.avg_sale_ugx),
  }));

  return res.status(200).json({ success: true, data: { start_date, end_date, commission_rate: COMMISSION_RATE, rows } });
}
