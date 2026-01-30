import { pool, query } from '../config/db.js';

const ALLOWED_STATUS = new Set(['available', 'used', 'expired']);

class DomainError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function normalizeVoucherCode(value) {
  return String(value ?? '').trim();
}

function normalizeStatus(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function parsePositiveId(value, fieldName) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const id = Number(trimmed);
  if (!Number.isFinite(id) || id <= 0) {
    throw new DomainError('BAD_REQUEST', `${fieldName} must be a valid number`, 400);
  }
  return Math.floor(id);
}

function uniquePositiveIntArray(ids) {
  if (!Array.isArray(ids)) {
    throw new DomainError('BAD_REQUEST', 'ids must be an array of numbers', 400);
  }

  const out = [];
  const seen = new Set();
  for (const raw of ids) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) {
      throw new DomainError('BAD_REQUEST', 'ids must contain only positive numbers', 400);
    }
    const intId = Math.floor(id);
    if (seen.has(intId)) continue;
    seen.add(intId);
    out.push(intId);
  }

  return out;
}

const EFFECTIVE_STATUS_SQL = `
  CASE
    WHEN v.status = 'available'::voucher_status
      AND v.expires_at IS NOT NULL
      AND v.expires_at < NOW()
    THEN 'expired'::voucher_status
    ELSE v.status
  END
`;

export class VouchersService {
  static async listVouchers({ status, packageId, batchId } = {}) {
    const conditions = [];
    const params = [];

    const normalizedStatus = normalizeStatus(status);
    if (normalizedStatus) {
      if (!ALLOWED_STATUS.has(normalizedStatus)) {
        throw new DomainError('BAD_REQUEST', `Invalid status: ${status}`, 400);
      }
      params.push(normalizedStatus);
      // Filter by effective status (time-based expiry).
      conditions.push(`${EFFECTIVE_STATUS_SQL} = $${params.length}::voucher_status`);
    }

    const pkgId = parsePositiveId(packageId, 'package_id');
    if (pkgId) {
      params.push(pkgId);
      conditions.push(`v.package_id = $${params.length}`);
    }

    const bId = parsePositiveId(batchId, 'batch_id');
    if (bId) {
      params.push(bId);
      conditions.push(`v.batch_id = $${params.length}`);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `
      SELECT
        v.id::int AS id,
        v.code,
        ${EFFECTIVE_STATUS_SQL} AS status,
        p.name AS package_name,
        v.batch_id,
        v.created_at,
        v.used_at
      FROM vouchers v
      JOIN packages p ON p.id = v.package_id
      ${whereSql}
      ORDER BY v.created_at DESC
      `,
      params
    );

    return result.rows;
  }

  static async redeemVoucher(code) {
    const normalizedCode = normalizeVoucherCode(code);
    if (!normalizedCode) {
      throw new DomainError('BAD_REQUEST', 'code is required', 400);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const voucherRes = await client.query(
        `
        SELECT
          v.id,
          v.code,
          v.status,
          v.expires_at,
          (v.expires_at IS NOT NULL AND v.expires_at < NOW()) AS is_expired,
          p.name AS package_name
        FROM vouchers v
        JOIN packages p ON p.id = v.package_id
        WHERE v.code = $1
        FOR UPDATE
        `,
        [normalizedCode]
      );

      const voucher = voucherRes.rows[0] ?? null;
      if (!voucher) {
        throw new DomainError('VOUCHER_NOT_FOUND', 'Voucher not found', 404);
      }

      if (voucher.status === 'used') {
        throw new DomainError('VOUCHER_ALREADY_USED', 'Voucher already used', 409);
      }

      if (voucher.status === 'expired' || voucher.is_expired) {
        throw new DomainError('VOUCHER_EXPIRED', 'Voucher is expired', 409);
      }

      const updateRes = await client.query(
        `
        UPDATE vouchers
        SET status = 'used'::voucher_status, used_at = NOW()
        WHERE id = $1
          AND status = 'available'::voucher_status
          AND (expires_at IS NULL OR expires_at >= NOW())
        RETURNING code, status, used_at
        `,
        [voucher.id]
      );

      if (updateRes.rowCount !== 1) {
        // Became unavailable/expired due to a concurrent update or time passing.
        throw new DomainError('VOUCHER_EXPIRED', 'Voucher cannot be redeemed', 409);
      }

      await client.query('COMMIT');

      const updated = updateRes.rows[0];
      return {
        code: updated.code,
        status: updated.status,
        package_name: voucher.package_name,
        used_at: updated.used_at,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async verifyVoucher(code) {
    const normalizedCode = normalizeVoucherCode(code);
    if (!normalizedCode) {
      throw new DomainError('BAD_REQUEST', 'code is required', 400);
    }

    const result = await query(
      `
      SELECT
        v.code,
        CASE
          WHEN v.status = 'used'::voucher_status THEN 'used'::voucher_status
          WHEN v.expires_at IS NOT NULL AND v.expires_at < NOW() THEN 'expired'::voucher_status
          ELSE 'available'::voucher_status
        END AS status,
        p.name AS package_name,
        v.expires_at,
        v.used_at
      FROM vouchers v
      JOIN packages p ON p.id = v.package_id
      WHERE v.code = $1
      `,
      [normalizedCode]
    );

    const row = result.rows[0] ?? null;
    if (!row) {
      throw new DomainError('VOUCHER_NOT_FOUND', 'Voucher not found', 404);
    }

    return row;
  }

  static async deleteVoucherById(id) {
    const voucherId = parsePositiveId(id, 'id');
    if (!voucherId) {
      throw new DomainError('BAD_REQUEST', 'id must be a valid number', 400);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const check = await client.query(
        `
        SELECT
          v.id,
          v.status,
          v.expires_at,
          (v.expires_at IS NOT NULL AND v.expires_at < NOW()) AS is_expired
        FROM vouchers v
        WHERE v.id = $1
        FOR UPDATE
        `,
        [voucherId]
      );

      const row = check.rows[0] ?? null;
      if (!row) {
        throw new DomainError('VOUCHER_NOT_FOUND', 'Voucher not found', 404);
      }

      if (row.status === 'used') {
        throw new DomainError('VOUCHER_ALREADY_USED', 'Voucher already used', 409);
      }

      if (row.status === 'expired' || row.is_expired) {
        throw new DomainError('VOUCHER_EXPIRED', 'Voucher is expired', 409);
      }

      if (row.status !== 'available') {
        throw new DomainError('VOUCHER_ALREADY_USED', `Voucher cannot be deleted (status: ${row.status})`, 409);
      }

      const del = await client.query(
        `
        DELETE FROM vouchers
        WHERE id = $1
          AND status = 'available'::voucher_status
          AND (expires_at IS NULL OR expires_at >= NOW())
        RETURNING id
        `,
        [voucherId]
      );

      if (del.rowCount !== 1) {
        // Race: became expired/used between check and delete.
        throw new DomainError('VOUCHER_EXPIRED', 'Voucher cannot be deleted', 409);
      }

      await client.query('COMMIT');
      return { deleted: 1 };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async deleteBulk({ ids } = {}) {
    const uniqueIds = uniquePositiveIntArray(ids);
    if (uniqueIds.length === 0) {
      return { deleted: 0, deletedIds: [] };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const del = await client.query(
        `
        DELETE FROM vouchers
        WHERE id = ANY($1::bigint[])
          AND status = 'available'::voucher_status
          AND (expires_at IS NULL OR expires_at >= NOW())
        RETURNING id
        `,
        [uniqueIds]
      );

      await client.query('COMMIT');
      const deletedIds = del.rows.map((r) => Number(r.id));
      return { deleted: deletedIds.length, deletedIds };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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

  return {
    httpStatus: 500,
    body: {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    },
  };
}
