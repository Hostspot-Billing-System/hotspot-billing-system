import { query } from '../config/db.js';

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

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function toMoneyNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function isSuccessStatusSql() {
  return "status IN ('completed','success')";
}

export async function getClientsOverview(req, res) {
  const range = parseDateRange(req);
  if (!range.ok) return res.status(400).json({ success: false, error: range.error });

  const { start_date, end_date } = range;

  const page = Math.max(1, toInt(req.query?.page, 1));
  const limit = Math.min(100, Math.max(5, toInt(req.query?.limit, 10)));
  const offset = (page - 1) * limit;

  // Summary for the period
  const summaryRes = await query(
    `
    SELECT
      COUNT(DISTINCT customer_phone)::int AS total_clients,
      COUNT(*)::int AS total_transactions,
      COALESCE(SUM(amount_ugx), 0) AS total_revenue_ugx
    FROM transactions
    WHERE payment_method = 'mobile_money'
      AND ${isSuccessStatusSql()}
      AND customer_phone IS NOT NULL
      AND btrim(customer_phone) <> ''
      AND created_at >= $1::date
      AND created_at < ($2::date + INTERVAL '1 day')
    `,
    [start_date, end_date]
  );

  const summaryRow = summaryRes.rows?.[0] ?? {};
  const totalClients = toInt(summaryRow.total_clients);

  // Paged client aggregates
  const rowsRes = await query(
    `
    WITH base AS (
      SELECT
        t.customer_phone,
        t.amount_ugx,
        t.created_at,
        date_trunc('day', t.created_at)::date AS day,
        COALESCE(p.name, t.bundle_name, 'Unknown') AS bundle_name
      FROM transactions t
      LEFT JOIN packages p ON p.id = t.bundle_id
      WHERE t.payment_method = 'mobile_money'
        AND ${isSuccessStatusSql()}
        AND t.customer_phone IS NOT NULL
        AND btrim(t.customer_phone) <> ''
        AND t.created_at >= $1::date
        AND t.created_at < ($2::date + INTERVAL '1 day')
    )
    SELECT
      customer_phone,
      COUNT(*)::int AS total_purchases,
      COALESCE(SUM(amount_ugx), 0) AS total_spent_ugx,
      MAX(created_at) AS last_purchase_at,
      COUNT(DISTINCT day)::int AS visit_days,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT bundle_name), NULL) AS purchased_bundles
    FROM base
    GROUP BY customer_phone
    ORDER BY total_spent_ugx DESC, last_purchase_at DESC, customer_phone ASC
    LIMIT $3::int
    OFFSET $4::int
    `,
    [start_date, end_date, limit, offset]
  );

  const rows = (rowsRes.rows ?? []).map((r) => ({
    customer_phone: String(r.customer_phone),
    total_purchases: toInt(r.total_purchases),
    total_spent_ugx: toMoneyNumber(r.total_spent_ugx),
    last_purchase_at: r.last_purchase_at ? new Date(r.last_purchase_at).toISOString() : null,
    last_purchase_date: r.last_purchase_at ? toDateOnlyStringUTC(new Date(r.last_purchase_at)) : null,
    visit_days: toInt(r.visit_days),
    purchased_bundles: Array.isArray(r.purchased_bundles) ? r.purchased_bundles.map(String) : [],
  }));

  const totalPages = Math.max(1, Math.ceil(totalClients / limit));

  return res.status(200).json({
    success: true,
    data: {
      start_date,
      end_date,
      summary: {
        total_clients: totalClients,
        total_transactions: toInt(summaryRow.total_transactions),
        total_revenue_ugx: toMoneyNumber(summaryRow.total_revenue_ugx),
      },
      pagination: {
        page,
        limit,
        total_clients: totalClients,
        total_pages: totalPages,
      },
      rows,
    },
  });
}
