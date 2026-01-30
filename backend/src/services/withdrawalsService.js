import { pool, query } from '../config/db.js';

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

function parsePositiveInt(value, fieldName, { defaultValue } = {}) {
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

function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function generateReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const rand = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `WD-${date}-${rand}`;
}

function validatePayout({ payout_method, payout_account }) {
  const method = normalizeText(payout_method);
  const account = normalizeText(payout_account);

  if (!method) {
    throw new DomainError('INVALID_PAYOUT_METHOD', 'payout_method is required', 400);
  }
  if (method !== 'mobile_money' && method !== 'bank') {
    throw new DomainError('INVALID_PAYOUT_METHOD', 'Invalid payout_method', 400);
  }
  if (!account) {
    throw new DomainError('BAD_REQUEST', 'payout_account is required', 400);
  }

  return { method, account };
}

function mapWithdrawalRow(row) {
  return {
    id: Number(row.id),
    reference: row.reference,
    total_amount: Number(row.total_amount ?? 0),
    commission_amount: Number(row.commission_amount ?? 0),
    net_amount: Number(row.net_amount ?? 0),
    status: row.status,
    requested_at: toIso(row.requested_at ?? row.created_at),
    completed_at: toIso(row.completed_at),
  };
}

function mapTransactionRowToContract(row) {
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

const WITHDRAWAL_BLOCKING_STATUSES = ['pending', 'approved', 'completed'];

export class WithdrawalsService {
  static async getWithdrawableBalance({ agent_id, client_id } = {}) {
    const agentId = agent_id == null ? null : parsePositiveInt(agent_id, 'agent_id');
    const clientId = client_id == null ? null : parsePositiveInt(client_id, 'client_id');

    const params = [WITHDRAWAL_BLOCKING_STATUSES];
    const conditions = [
      `t.status = 'completed'`,
      `t.paid_at IS NOT NULL`,
      `NOT EXISTS (
        SELECT 1
        FROM withdrawal_transactions wt
        JOIN withdrawals w ON w.id = wt.withdrawal_id
        WHERE wt.transaction_id = t.id
          AND w.status = ANY($1::text[])
      )`,
    ];

    if (agentId) {
      params.push(agentId);
      conditions.push(`(t.agent_id = $${params.length})`);
    }
    if (clientId) {
      params.push(clientId);
      conditions.push(`(t.client_id = $${params.length})`);
    }

    const whereSql = `WHERE ${conditions.join(' AND ')}`;

    const result = await query(
      `
      SELECT COALESCE(SUM(t.net_amount), 0)::float8 AS withdrawable
      FROM transactions t
      ${whereSql}
      `,
      params
    );

    const withdrawable = Number(result.rows?.[0]?.withdrawable ?? 0);
    return withdrawable;
  }

  static async requestWithdrawal({ payout_method, payout_account, agent_id, client_id } = {}) {
    const { method, account } = validatePayout({ payout_method, payout_account });
    const agentId = agent_id == null ? null : parsePositiveInt(agent_id, 'agent_id');
    const clientId = client_id == null ? null : parsePositiveInt(client_id, 'client_id');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const params = [WITHDRAWAL_BLOCKING_STATUSES];
      const conditions = [
        `t.status = 'completed'`,
        `t.paid_at IS NOT NULL`,
        `NOT EXISTS (
          SELECT 1
          FROM withdrawal_transactions wt
          JOIN withdrawals w ON w.id = wt.withdrawal_id
          WHERE wt.transaction_id = t.id
            AND w.status = ANY($1::text[])
        )`,
      ];

      if (agentId) {
        params.push(agentId);
        conditions.push(`(t.agent_id = $${params.length})`);
      }
      if (clientId) {
        params.push(clientId);
        conditions.push(`(t.client_id = $${params.length})`);
      }

      const whereSql = `WHERE ${conditions.join(' AND ')}`;

      // Lock eligible transactions to prevent concurrent double-withdrawal.
      const txRes = await client.query(
        `
        SELECT
          t.id,
          t.amount::float8 AS amount_ugx,
          t.commission_amount::float8 AS commission_ugx,
          t.net_amount::float8 AS net_amount_ugx
        FROM transactions t
        ${whereSql}
        ORDER BY t.created_at ASC
        FOR UPDATE OF t SKIP LOCKED
        `,
        params
      );

      const txRows = txRes.rows ?? [];
      if (txRows.length === 0) {
        throw new DomainError('NO_WITHDRAWABLE_BALANCE', 'No withdrawable balance available', 409);
      }

      let totalAmount = 0;
      let commissionAmount = 0;
      let netAmount = 0;
      for (const r of txRows) {
        totalAmount += Number(r.amount_ugx ?? 0);
        commissionAmount += Number(r.commission_ugx ?? 0);
        netAmount += Number(r.net_amount_ugx ?? 0);
      }

      if (!(netAmount > 0)) {
        throw new DomainError('NO_WITHDRAWABLE_BALANCE', 'No withdrawable balance available', 409);
      }

      let created = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const reference = generateReference();
        try {
          const wRes = await client.query(
            `
            INSERT INTO withdrawals (
              reference,
              agent_id,
              client_id,
              total_amount,
              commission_amount,
              net_amount,
              status,
              payout_method,
              payout_account,
              requested_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, NOW())
            RETURNING
              id,
              reference,
              total_amount,
              commission_amount,
              net_amount,
              status,
              requested_at,
              completed_at,
              created_at
            `,
            [
              reference,
              agentId,
              clientId,
              totalAmount,
              commissionAmount,
              netAmount,
              method,
              account,
            ]
          );
          created = wRes.rows[0];
          break;
        } catch (e) {
          // 23505: unique_violation
          if (e?.code === '23505') continue;
          throw e;
        }
      }

      if (!created) {
        throw new DomainError('INTERNAL_ERROR', 'Failed to generate withdrawal reference', 500);
      }

      const withdrawalId = created.id;
      const insertValues = [];
      const insertParams = [];
      for (const r of txRows) {
        insertParams.push(withdrawalId, r.id);
        const i = insertParams.length;
        insertValues.push(`($${i - 1}, $${i})`);
      }

      await client.query(
        `
        INSERT INTO withdrawal_transactions (withdrawal_id, transaction_id)
        VALUES ${insertValues.join(', ')}
        `,
        insertParams
      );

      await client.query('COMMIT');
      return mapWithdrawalRow(created);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async listWithdrawals({ page, perPage } = {}) {
    const p = parsePositiveInt(page, 'page', { defaultValue: 1 });
    const pp = parsePositiveInt(perPage, 'perPage', { defaultValue: 20 });
    const safePerPage = Math.min(100, Math.max(1, pp));
    const offset = (p - 1) * safePerPage;

    const countRes = await query('SELECT COUNT(*)::int AS total FROM withdrawals');
    const total = countRes.rows?.[0]?.total ?? 0;
    const totalPages = total ? Math.ceil(total / safePerPage) : 0;

    const rowsRes = await query(
      `
      SELECT
        id,
        reference,
        total_amount,
        commission_amount,
        net_amount,
        status,
        requested_at,
        completed_at,
        created_at
      FROM withdrawals
      ORDER BY requested_at DESC, id DESC
      LIMIT $1 OFFSET $2
      `,
      [safePerPage, offset]
    );

    return {
      meta: { page: p, perPage: safePerPage, total, totalPages },
      data: rowsRes.rows.map(mapWithdrawalRow),
    };
  }

  static async getWithdrawalById(id) {
    const withdrawalId = parsePositiveInt(id, 'id');
    if (!withdrawalId) {
      throw new DomainError('BAD_REQUEST', 'id must be a valid number', 400);
    }

    const wRes = await query(
      `
      SELECT
        id,
        reference,
        total_amount,
        commission_amount,
        net_amount,
        status,
        payout_method,
        payout_account,
        requested_at,
        approved_at,
        completed_at,
        created_at
      FROM withdrawals
      WHERE id = $1
      `,
      [withdrawalId]
    );

    const w = wRes.rows[0] ?? null;
    if (!w) {
      throw new DomainError('WITHDRAWAL_NOT_FOUND', 'Withdrawal not found', 404);
    }

    const txRes = await query(
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
      FROM withdrawal_transactions wt
      JOIN transactions t ON t.id = wt.transaction_id
      WHERE wt.withdrawal_id = $1
      ORDER BY t.created_at DESC, t.id DESC
      `,
      [withdrawalId]
    );

    return {
      withdrawal: {
        id: Number(w.id),
        reference: w.reference,
        payout_method: w.payout_method,
        payout_account: w.payout_account,
        total_amount: Number(w.total_amount ?? 0),
        commission_amount: Number(w.commission_amount ?? 0),
        net_amount: Number(w.net_amount ?? 0),
        status: w.status,
        requested_at: toIso(w.requested_at ?? w.created_at),
        approved_at: toIso(w.approved_at),
        completed_at: toIso(w.completed_at),
      },
      transactions: txRes.rows.map(mapTransactionRowToContract),
    };
  }
}

export function toHttpError(err) {
  if (err instanceof DomainError) {
    return {
      httpStatus: err.httpStatus,
      body: { success: false, error: { code: err.code, message: err.message } },
    };
  }

  // 42P01: undefined_table
  if (err?.code === '42P01') {
    return {
      httpStatus: 500,
      body: {
        success: false,
        error: {
          code: 'SCHEMA_MISSING',
          message: 'Database schema is missing. Apply withdrawals migration, then retry.',
        },
      },
    };
  }

  return {
    httpStatus: 500,
    body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
  };
}
