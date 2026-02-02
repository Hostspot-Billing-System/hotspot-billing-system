import { query } from '../config/db.js';

function isUniqueViolation(err) {
  return err && (err.code === '23505' || err.code === 23505);
}

function isNotNullViolation(err) {
  // 23502: not_null_violation
  return err && (err.code === '23502' || err.code === 23502);
}

function generateReference() {
  const ts = Date.now();
  const rnd = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `TXN-${ts}-${rnd}`;
}

class DomainError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function isUndefinedColumn(err) {
  // 42703: undefined_column
  return err && err.code === '42703';
}

async function hasPublicTableColumn(client, { table, column }) {
  const t = String(table ?? '').trim();
  const c = String(column ?? '').trim();
  if (!t || !c) return false;
  const res = await client.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = $2
    LIMIT 1
    `,
    [t, c]
  );
  return Boolean(res.rows?.[0]);
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

function normalizeVoucherAttemptStatus(value) {
  const s = normalizeText(value);
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower !== 'success' && lower !== 'failed') {
    throw new DomainError('BAD_REQUEST', `Invalid voucher attempt status: ${value}`, 400);
  }
  return lower;
}

function derivePackageKeyFromVoucherCode(voucherCode) {
  const c = String(voucherCode ?? '').trim().toUpperCase();
  if (!c) return null;
  if (c.includes('2H')) return '2h';
  if (c.includes('12H')) return '12h';
  if (c.includes('DAILY')) return 'daily';
  if (c.includes('WEEKLY')) return 'weekly';
  if (c.includes('MONTHLY')) return 'monthly';
  return null;
}

async function resolveBundleFromVoucherCodeTransactional(client, voucherCode) {
  const code = normalizeText(voucherCode);
  if (!code) return { bundle_id: null, duration_minutes: null, price_ugx: null };

  // First try a real voucher row.
  const hasPriceUgx = await hasPublicTableColumn(client, { table: 'packages', column: 'price_ugx' });
  const res = await client.query(
    `
    SELECT v.package_id::int AS bundle_id,
           p.duration_minutes::int AS duration_minutes,
           ${hasPriceUgx ? 'p.price_ugx::int AS price_ugx' : 'NULL::int AS price_ugx'}
    FROM vouchers v
    JOIN packages p ON p.id = v.package_id
    WHERE v.code = $1
    LIMIT 1
    `,
    [code]
  );

  if (res.rows?.[0]) {
    return {
      bundle_id: res.rows[0].bundle_id ?? null,
      duration_minutes: res.rows[0].duration_minutes ?? null,
      price_ugx: res.rows[0].price_ugx ?? null,
    };
  }

  // Fallback: if this looks like a seeded/mock voucher, map it to a package by name.
  const key = derivePackageKeyFromVoucherCode(code);
  if (!key) return { bundle_id: null, duration_minutes: null, price_ugx: null };

  const namePattern =
    key === '2h'
      ? '%2 hour%'
      : key === '12h'
        ? '%12 hour%'
        : key === 'daily'
          ? '%daily%'
          : key === 'weekly'
            ? '%weekly%'
            : key === 'monthly'
              ? '%monthly%'
              : null;

  if (!namePattern) return { bundle_id: null, duration_minutes: null, price_ugx: null };

  const pkgRes = await client.query(
    `
    SELECT p.id::int AS bundle_id,
           p.duration_minutes::int AS duration_minutes,
           ${hasPriceUgx ? 'p.price_ugx::int AS price_ugx' : 'NULL::int AS price_ugx'}
    FROM packages p
    WHERE LOWER(p.name) LIKE LOWER($1)
    ORDER BY p.id ASC
    LIMIT 1
    `,
    [namePattern]
  );

  const pkg = pkgRes.rows?.[0];
  return {
    bundle_id: pkg?.bundle_id ?? null,
    duration_minutes: pkg?.duration_minutes ?? null,
    price_ugx: pkg?.price_ugx ?? null,
  };
}

function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeLegacyTransactionStatus(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return raw;
  const lower = raw.toLowerCase();
  if (lower === 'success') return 'completed';
  return lower;
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
    status: normalizeLegacyTransactionStatus(row.status),
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
  static toHttpError(err) {
    if (err instanceof DomainError) {
      return {
        httpStatus: err.httpStatus,
        body: { success: false, error: { code: err.code, message: err.message } },
      };
    }
    return {
      httpStatus: 500,
      body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    };
  }

  static async lockPortalPaymentForMacTransactional(client, { mac }) {
    const macAddress = normalizeText(mac);
    if (!macAddress) throw new DomainError('BAD_REQUEST', 'mac is required', 400);

    // Serialize payment initiation per MAC.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)) AS locked', [macAddress]);
  }

  static async assertNoPendingPortalPaymentForMacTransactional(client, { mac }) {
    const macAddress = normalizeText(mac);
    if (!macAddress) throw new DomainError('BAD_REQUEST', 'mac is required', 400);

    // We associate portal payments to portal_sessions via transactions.client_id.
    const res = await client.query(
      `
      SELECT t.id
      FROM transactions t
      JOIN portal_sessions ps ON ps.id = t.client_id
      WHERE ps.mac_address = $1
        AND t.status = 'pending'
        AND (t.payment_method IS NULL OR t.payment_method = 'MOBILE_MONEY')
      LIMIT 1
      `,
      [macAddress]
    );

    if (res.rows?.[0]) {
      throw new DomainError(
        'PENDING_PAYMENT_EXISTS',
        'A payment is already pending for this device. Complete it or wait before retrying.',
        409
      );
    }
  }

  static async getActiveBundleForPortalPurchaseTransactional(client, { bundle_id }) {
    const bundleId = parseOptionalPositiveInt(bundle_id, 'bundle_id');
    if (!bundleId) throw new DomainError('BAD_REQUEST', 'bundle_id must be a valid number', 400);

	// Transaction-safe schema tolerance: avoid errors that would abort the transaction.
	const hasIsActive = await hasPublicTableColumn(client, { table: 'packages', column: 'is_active' });
	const hasPriceUgx = await hasPublicTableColumn(client, { table: 'packages', column: 'price_ugx' });

	const columns = [
		'id',
		'name',
		'duration_minutes',
		hasPriceUgx ? 'price_ugx::int AS price_ugx' : null,
		hasIsActive ? 'is_active' : null,
	]
		.filter(Boolean)
		.join(', ');

	const res = await client.query(
		`
		SELECT ${columns}
		FROM packages
		WHERE id = $1
		LIMIT 1
		`,
		[bundleId]
	);

	const row = res.rows?.[0];
	if (!row) throw new DomainError('BUNDLE_NOT_FOUND', 'Bundle not found', 404);
	if (hasIsActive && row.is_active === false) {
		throw new DomainError('BUNDLE_INACTIVE', 'Bundle is inactive', 409);
	}

  if (!hasPriceUgx) {
    throw new DomainError('BUNDLE_PRICE_MISSING', 'Bundle price is missing', 500);
  }
  const price = row.price_ugx == null ? null : Number(row.price_ugx);
  if (price == null || !Number.isFinite(price) || price <= 0) {
    throw new DomainError('BUNDLE_PRICE_MISSING', 'Bundle price is missing', 500);
  }

	return {
		id: Number(row.id),
		name: row.name,
		duration_minutes: Number(row.duration_minutes),
		price_ugx: Number(price),
	};
  }

  static async createPendingPortalPaymentTransactionTransactional(
    client,
    { portal_session_id, bundle_id, customer_phone, amount_ugx, payment_provider } = {}
  ) {
    const portalSessionId = parseOptionalPositiveInt(portal_session_id, 'portal_session_id');
    if (!portalSessionId) throw new DomainError('BAD_REQUEST', 'portal_session_id must be a valid number', 400);
    const bundleId = parseOptionalPositiveInt(bundle_id, 'bundle_id');
    if (!bundleId) throw new DomainError('BAD_REQUEST', 'bundle_id must be a valid number', 400);
    const phone = normalizeText(customer_phone);
    if (!phone) throw new DomainError('BAD_REQUEST', 'customer_phone is required', 400);
    const amount = parseOptionalNumber(amount_ugx, 'amount_ugx');
    if (amount == null || amount <= 0) {
      throw new DomainError('BAD_REQUEST', 'amount_ugx must be a valid positive number', 400);
    }

    const provider = this.normalizePaymentProvider(payment_provider ?? 'MTN');

    let reference = generateReference();
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await client.query(
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
          payment_provider,
          client_id
        ) VALUES (
          $1,
          NULL,
          $2,
          $3,
          $4,
          NULL,
          'pending',
          'MOBILE_MONEY',
          $6::payment_provider_enum,
          $5
        )
        ON CONFLICT (reference) DO NOTHING
        RETURNING id, reference
        `,
        [reference, bundleId, phone, amount, portalSessionId, provider]
      );

      if (res.rows?.[0]) {
        return { id: Number(res.rows?.[0]?.id), reference: res.rows?.[0]?.reference ?? reference };
      }

      reference = generateReference();
    }

    throw new DomainError('REFERENCE_COLLISION', 'Failed to generate unique transaction reference', 500);
  }

  static async createPendingPortalBuyTransactionTransactional(
    client,
    { bundle_id, customer_phone, amount_ugx, payment_provider } = {}
  ) {
    const bundleId = parseOptionalPositiveInt(bundle_id, 'bundle_id');
    if (!bundleId) throw new DomainError('BAD_REQUEST', 'bundle_id must be a valid number', 400);
    const phone = normalizeText(customer_phone);
    if (!phone) throw new DomainError('BAD_REQUEST', 'customer_phone is required', 400);

    const amount = parseOptionalNumber(amount_ugx, 'amount_ugx');
    const provider = this.normalizePaymentProvider(payment_provider);

    let reference = generateReference();
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await client.query(
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
          payment_provider,
          client_id
        ) VALUES (
          $1,
          NULL,
          $2,
          $3,
          $4,
          NULL,
          'pending',
          'MOBILE_MONEY',
          $5::payment_provider_enum,
          NULL
        )
        ON CONFLICT (reference) DO NOTHING
        RETURNING id, reference
        `,
        [reference, bundleId, phone, amount, provider]
      );

      if (res.rows?.[0]) {
        return { id: Number(res.rows?.[0]?.id), reference: res.rows?.[0]?.reference ?? reference };
      }

      reference = generateReference();
    }

    throw new DomainError('REFERENCE_COLLISION', 'Failed to generate unique transaction reference', 500);
  }

  static async markTransactionSuccessByReference(reference, { payment_provider } = {}) {
    const ref = normalizeText(reference);
    if (!ref) throw new DomainError('BAD_REQUEST', 'reference is required', 400);

    const provider = this.normalizePaymentProvider(payment_provider);

    await query(
      `
      UPDATE transactions
      SET status = 'completed',
        payment_method = COALESCE(payment_method, 'MOBILE_MONEY'),
        payment_provider = $2::payment_provider_enum,
        paid_at = COALESCE(paid_at, NOW()),
        updated_at = NOW(),
        failure_reason = NULL
      WHERE reference = $1
      `,
      [ref, provider]
    );
  }

  static async markTransactionFailedByReference(reference, { failure_reason, payment_provider } = {}) {
    const ref = normalizeText(reference);
    if (!ref) throw new DomainError('BAD_REQUEST', 'reference is required', 400);

    const provider = this.normalizePaymentProvider(payment_provider);

    await query(
      `
      UPDATE transactions
      SET status = 'failed',
        payment_method = COALESCE(payment_method, 'MOBILE_MONEY'),
        payment_provider = $3::payment_provider_enum,
        failure_reason = LEFT($2, 255),
        updated_at = NOW()
      WHERE reference = $1
      `,
      [ref, String(failure_reason ?? 'Payment initiation failed'), provider]
    );
  }

  static assertAmountMatches(expectedAmountUgx, actualAmountUgx) {
    const expected = Number(expectedAmountUgx ?? 0);
    const actual = Number(actualAmountUgx);
    if (!Number.isFinite(actual)) {
      throw new DomainError('BAD_REQUEST', 'amount_ugx must be a valid number', 400);
    }
    // Compare with 2 decimal precision.
    if (Number(expected.toFixed(2)) !== Number(actual.toFixed(2))) {
      throw new DomainError('AMOUNT_MISMATCH', 'Callback amount mismatch', 400);
    }
  }

  static normalizePaymentProvider(provider) {
    const p = String(provider ?? '').trim().toUpperCase();
    if (p === 'MTN') return 'MTN';
    if (p === 'AIRTEL') return 'AIRTEL';
    if (!p || p === 'NONE') return 'NONE';
    return 'NONE';
  }

  static async getTransactionByReferenceForUpdateTransactional(client, reference) {
    const ref = normalizeText(reference);
    if (!ref) throw new DomainError('BAD_REQUEST', 'reference is required', 400);

    const res = await client.query(
      `
      SELECT
        id,
        reference,
        bundle_id,
        customer_phone,
        amount_ugx,
        status,
        payment_method,
        payment_provider,
        failure_reason,
        client_id,
        paid_at
      FROM transactions
      WHERE reference = $1
      FOR UPDATE
      `,
      [ref]
    );

    const row = res.rows?.[0];
    if (!row) throw new DomainError('NOT_FOUND', 'Transaction not found', 404);

    return {
      id: Number(row.id),
      reference: row.reference,
      bundle_id: Number(row.bundle_id),
      customer_phone: row.customer_phone ?? null,
      amount_ugx: row.amount_ugx == null ? null : Number(row.amount_ugx),
      status: String(row.status ?? '').toLowerCase(),
      payment_method: row.payment_method ?? null,
      payment_provider: row.payment_provider ?? null,
      failure_reason: row.failure_reason ?? null,
      client_id: row.client_id == null ? null : Number(row.client_id),
      paid_at: row.paid_at ?? null,
    };
  }

  static async markTransactionCompletedTransactional(client, reference, { payment_provider, provider_tx_id } = {}) {
    const ref = normalizeText(reference);
    if (!ref) throw new DomainError('BAD_REQUEST', 'reference is required', 400);
    const provider = this.normalizePaymentProvider(payment_provider);

    await client.query(
      `
      UPDATE transactions
      SET status = 'completed',
        payment_method = COALESCE(payment_method, 'MOBILE_MONEY'),
        payment_provider = $2::payment_provider_enum,
        paid_at = COALESCE(paid_at, NOW()),
        updated_at = NOW(),
        failure_reason = NULL
      WHERE reference = $1
      `,
      [ref, provider]
    );

    // provider_tx_id intentionally not persisted yet (no column in schema).
    void provider_tx_id;
  }

  static async markTransactionFailedTransactional(
    client,
    reference,
    { failure_reason, payment_provider, provider_tx_id } = {}
  ) {
    const ref = normalizeText(reference);
    if (!ref) throw new DomainError('BAD_REQUEST', 'reference is required', 400);
    const provider = this.normalizePaymentProvider(payment_provider);
    const reason = String(failure_reason ?? 'Payment failed');
    const suffix = provider_tx_id ? ` provider_tx_id=${String(provider_tx_id).slice(0, 100)}` : '';

    await client.query(
      `
      UPDATE transactions
      SET status = 'failed',
        payment_method = COALESCE(payment_method, 'MOBILE_MONEY'),
        payment_provider = $2::payment_provider_enum,
        failure_reason = LEFT($3, 255),
        updated_at = NOW()
      WHERE reference = $1
      `,
      [ref, provider, `${reason}${suffix}`]
    );
  }

  static async getPortalSessionForTransactionTransactional(client, { portal_session_id }) {
    const id = parseOptionalPositiveInt(portal_session_id, 'portal_session_id');
    if (!id) throw new DomainError('BAD_REQUEST', 'portal_session_id must be a valid number', 400);

    const res = await client.query(
      `
      SELECT id, mac_address, ip_address
      FROM portal_sessions
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );
    const row = res.rows?.[0];
    if (!row) throw new DomainError('SESSION_NOT_FOUND', 'Portal session not found for transaction', 404);
    return {
      id: Number(row.id),
      mac_address: row.mac_address,
      ip_address: String(row.ip_address),
    };
  }

  static async getBundleForActivationTransactional(client, { bundle_id }) {
    const bundleId = parseOptionalPositiveInt(bundle_id, 'bundle_id');
    if (!bundleId) throw new DomainError('BAD_REQUEST', 'bundle_id must be a valid number', 400);

    const res = await client.query(
      `
      SELECT id, duration_minutes
      FROM packages
      WHERE id = $1
      LIMIT 1
      `,
      [bundleId]
    );
    const row = res.rows?.[0];
    if (!row) throw new DomainError('BUNDLE_NOT_FOUND', 'Bundle not found', 404);
    return { id: Number(row.id), duration_minutes: Number(row.duration_minutes) };
  }

  static async createVoucherTransactionTransactional(client, { voucher_code, bundle_id, amount_ugx }) {
	// Strict rule: voucher usage is NOT a financial transaction.
	// Keep this method as a hard failure to prevent regressions.
	void client;
	void voucher_code;
	void bundle_id;
	void amount_ugx;
	throw new DomainError('NOT_ALLOWED', 'Voucher actions must not create transactions', 409);

    const voucherCode = normalizeText(voucher_code);
    const bundleId = parseOptionalPositiveInt(bundle_id, 'bundle_id');
    if (!bundleId) {
      throw new DomainError('BAD_REQUEST', 'bundle_id must be a valid number', 400);
    }

    const insertSql = `
      INSERT INTO transactions (
        reference,
        voucher_code,
        bundle_id,
        customer_phone,
        amount_ugx,
        commission_ugx,
        status,
        payment_method,
        payment_provider
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        NULL,
        'success',
        'VOUCHER',
        'NONE'
      )
      ON CONFLICT (reference) DO NOTHING
      RETURNING id, reference
    `;

    let reference = generateReference();
    for (let attempt = 0; attempt < 5; attempt++) {
      // Some DBs may have tightened customer_phone to NOT NULL; keep this insert transaction-safe.
      const res = await client.query(insertSql, [reference, voucherCode, bundleId, '', amount_ugx]);

      if (res.rows?.[0]) {
        return { id: Number(res.rows?.[0]?.id), reference: res.rows?.[0]?.reference ?? reference };
      }

      reference = generateReference();
    }

    throw new DomainError('REFERENCE_COLLISION', 'Failed to generate unique transaction reference', 500);
  }

  static async createPortalVoucherAttemptTransactional(
    client,
    { voucher_code, bundle_id, amount_ugx, status, failure_reason } = {}
  ) {
	// Strict rule: voucher login/connect must not create any transactions.
	void client;
	void voucher_code;
	void bundle_id;
	void amount_ugx;
	void status;
	void failure_reason;
	throw new DomainError('NOT_ALLOWED', 'Voucher actions must not create transactions', 409);

    const voucherCode = normalizeText(voucher_code);
    const bundleId = parseOptionalPositiveInt(bundle_id, 'bundle_id');
    const st = normalizeVoucherAttemptStatus(status);
    if (!st) throw new DomainError('BAD_REQUEST', 'status is required', 400);

    const hasFailureReason = await hasPublicTableColumn(client, { table: 'transactions', column: 'failure_reason' });

    const columns = [
      'reference',
      'voucher_code',
      'bundle_id',
      'customer_phone',
      'amount_ugx',
      'commission_ugx',
      'status',
      'payment_method',
      'payment_provider',
      hasFailureReason ? 'failure_reason' : null,
    ]
      .filter(Boolean)
      .join(', ');

    const values = [
      '$1',
      '$2',
      '$3',
      '$4',
      '$5',
      'NULL',
      '$6',
      '$7',
      '$8',
      hasFailureReason ? '$9' : null,
    ]
      .filter(Boolean)
      .join(', ');

    const insertSql = `
      INSERT INTO transactions (${columns})
      VALUES (${values})
      ON CONFLICT (reference) DO NOTHING
      RETURNING id, reference
    `;

    const reason = st === 'failed' ? normalizeText(failure_reason) ?? 'FAILED' : null;

    let reference = generateReference();
    for (let attempt = 0; attempt < 5; attempt++) {
      const params = [reference, voucherCode, bundleId, '', amount_ugx, st, 'VOUCHER', 'NONE'];
      if (hasFailureReason) params.push(reason);

      const res = await client.query(insertSql, params);
      if (res.rows?.[0]) {
        return { id: Number(res.rows?.[0]?.id), reference: res.rows?.[0]?.reference ?? reference };
      }
      reference = generateReference();
    }

    throw new DomainError('REFERENCE_COLLISION', 'Failed to generate unique transaction reference', 500);
  }

  static async createPortalVoucherAttempt({ voucher_code, status, failure_reason } = {}) {
  // Strict rule: voucher login/connect must not create any transactions.
  void voucher_code;
  void status;
  void failure_reason;
  throw new DomainError('NOT_ALLOWED', 'Voucher actions must not create transactions', 409);

    const st = normalizeVoucherAttemptStatus(status);
    if (!st) throw new DomainError('BAD_REQUEST', 'status is required', 400);

    const { pool } = await import('../config/db.js');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const created = await this.createPortalVoucherAttemptTransactional(client, {
        voucher_code,
        bundle_id: null,
        amount_ugx: null,
        status: st,
        failure_reason,
      });

      await client.query('COMMIT');
      return created;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
      throw err;
    } finally {
      client.release();
    }
  }

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
      status: normalizeLegacyTransactionStatus(r.status),
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
