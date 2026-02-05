import { pool, query } from '../config/db.js';
import { provisionVoucherOnMikroTik, MikroTikProvisioningError } from './mikrotikProvisioningService.js';
import { MikroTikClientError } from '../integrations/mikrotik/mikrotikClient.js';

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

function isUniqueViolation(err) {
  return err && (err.code === '23505' || err.code === 23505);
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

function generateReference() {
  const ts = Date.now();
  const rnd = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `TXN-${ts}-${rnd}`;
}

function normalizeUgPhoneOrThrow(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    throw new DomainError('BAD_REQUEST', 'phone_number is required', 400);
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    throw new DomainError('BAD_REQUEST', 'phone_number is invalid', 400);
  }

  if (digits.startsWith('256') && digits.length === 12 && digits[3] === '7') {
    return `+${digits}`;
  }

  if (digits.startsWith('0') && digits.length === 10 && digits[1] === '7') {
    return `+256${digits.slice(1)}`;
  }

  if (digits.length === 9 && digits[0] === '7') {
    return `+256${digits}`;
  }

  throw new DomainError('BAD_REQUEST', 'phone_number must be a valid UG phone number', 400);
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

let hasVouchersUsedByColumnCache = null;

async function vouchersHasUsedByColumn(client) {
  if (hasVouchersUsedByColumnCache != null) return hasVouchersUsedByColumnCache;
  const ok = await hasPublicTableColumn(client, { table: 'vouchers', column: 'used_by' });
  hasVouchersUsedByColumnCache = ok;
  return ok;
}

export class VouchersService {
  static async listVouchers({ status, packageId, batchId } = {}) {
    const client = await pool.connect();
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

    try {
      const includeUsedBy = await vouchersHasUsedByColumn(client);
      const usedBySelect = includeUsedBy ? ', v.used_by' : '';

      const result = await client.query(
        `
        SELECT
          v.id::int AS id,
          v.code,
          ${EFFECTIVE_STATUS_SQL} AS status,
          p.name AS package_name,
          p.price_ugx,
          v.batch_id,
          v.created_at,
          v.used_at
          ${usedBySelect}
        FROM vouchers v
        JOIN packages p ON p.id = v.package_id
        ${whereSql}
        ORDER BY v.created_at DESC
        `,
        params
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  static async sellVoucherDirectlyById({ id, phone_number, customer_name, notes } = {}) {
    void customer_name;
    void notes;

    const voucherId = parsePositiveId(id, 'id');
    if (!voucherId) {
      throw new DomainError('BAD_REQUEST', 'id must be a valid number', 400);
    }

    const normalizedPhone = normalizeUgPhoneOrThrow(phone_number);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const includeUsedBy = await vouchersHasUsedByColumn(client);

      const voucherRes = await client.query(
        `
        SELECT
          v.id,
          v.code,
          v.status,
          v.expires_at,
          (v.expires_at IS NOT NULL AND v.expires_at < NOW()) AS is_expired,
          v.package_id,
          p.name AS package_name,
          p.price_ugx
        FROM vouchers v
        JOIN packages p ON p.id = v.package_id
        WHERE v.id = $1
        FOR UPDATE
        `,
        [voucherId]
      );

      const voucher = voucherRes.rows?.[0] ?? null;
      if (!voucher) {
        throw new DomainError('VOUCHER_NOT_FOUND', 'Voucher not found', 404);
      }

      if (voucher.status === 'used') {
        throw new DomainError('VOUCHER_ALREADY_USED', 'Voucher already used', 409);
      }

      if (voucher.status === 'expired' || voucher.is_expired) {
        throw new DomainError('VOUCHER_EXPIRED', 'Voucher is expired', 409);
      }

      const updateParams = [voucherId];
      const setClauses = ["status = 'used'::voucher_status", 'used_at = NOW()'];
      if (includeUsedBy) {
        updateParams.push(normalizedPhone);
        setClauses.push(`used_by = $${updateParams.length}`);
      }

      const updateRes = await client.query(
        `
        UPDATE vouchers
        SET ${setClauses.join(', ')}
        WHERE id = $1
          AND status = 'available'::voucher_status
          AND (expires_at IS NULL OR expires_at >= NOW())
        RETURNING id, code, status, used_at${includeUsedBy ? ', used_by' : ''}
        `,
        updateParams
      );

      if (updateRes.rowCount !== 1) {
        throw new DomainError('VOUCHER_EXPIRED', 'Voucher cannot be sold', 409);
      }

      const updatedVoucher = updateRes.rows?.[0] ?? null;

      // Insert a cash transaction (best-effort schema compatibility).
      const hasPaymentProvider = await hasPublicTableColumn(client, { table: 'transactions', column: 'payment_provider' });
      const hasPaidAt = await hasPublicTableColumn(client, { table: 'transactions', column: 'paid_at' });
      const hasSource = await hasPublicTableColumn(client, { table: 'transactions', column: 'source' });
      const hasVoucherIdCol = await hasPublicTableColumn(client, { table: 'transactions', column: 'voucher_id' });

      const amountUgx = Number(voucher.price_ugx ?? 0);
      if (!Number.isFinite(amountUgx) || amountUgx <= 0) {
        throw new DomainError('BAD_REQUEST', 'Voucher price is missing for this bundle', 400);
      }

      const columns = [
        'reference',
        'voucher_code',
        'bundle_id',
        'customer_phone',
        'amount_ugx',
        'commission_ugx',
        'status',
        'payment_method',
        hasPaymentProvider ? 'payment_provider' : null,
        hasPaidAt ? 'paid_at' : null,
        hasSource ? 'source' : null,
        hasVoucherIdCol ? 'voucher_id' : null,
      ].filter(Boolean);

      // reference
      let reference = generateReference();
      // voucher_code
      // bundle_id
      // customer_phone
      // amount_ugx
      // commission_ugx
      // status
      // payment_method
      // payment_provider?
      // paid_at?
      // source?
      // voucher_id?

      async function tryInsertTx() {
        const txParams = [];
        const renderedValues = [];
        for (let i = 0; i < columns.length; i += 1) {
          const col = columns[i];
          if (col === 'paid_at') {
            renderedValues.push('NOW()');
            continue;
          }

          let param = null;
          if (col === 'reference') param = reference;
          else if (col === 'voucher_code') param = String(voucher.code);
          else if (col === 'bundle_id') param = Number(voucher.package_id);
          else if (col === 'customer_phone') param = normalizedPhone;
          else if (col === 'amount_ugx') param = amountUgx;
          else if (col === 'commission_ugx') param = 0;
          else if (col === 'status') param = 'success';
          else if (col === 'payment_method') param = 'cash';
          else if (col === 'payment_provider') param = 'NONE';
          else if (col === 'source') param = 'admin_direct_sale';
          else if (col === 'voucher_id') param = Number(voucher.id);

          txParams.push(param);
          renderedValues.push(`$${txParams.length}`);
        }

        const finalSql = `
          INSERT INTO transactions (${columns.join(', ')})
          VALUES (${renderedValues.join(', ')})
          RETURNING id, reference
        `;

        const txRes = await client.query(finalSql, txParams);
        return txRes.rows?.[0] ?? null;
      }

      let txRow = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          txRow = await tryInsertTx();
          break;
        } catch (err) {
          if (isUniqueViolation(err)) {
            reference = generateReference();
            continue;
          }
          throw err;
        }
      }

      if (!txRow) {
        throw new DomainError('REFERENCE_COLLISION', 'Failed to generate unique transaction reference', 500);
      }

      await client.query('COMMIT');

      return {
        voucher: {
          id: Number(updatedVoucher.id),
          code: String(updatedVoucher.code),
          status: String(updatedVoucher.status),
          used_at: updatedVoucher.used_at,
          used_by: includeUsedBy ? updatedVoucher.used_by : normalizedPhone,
          package_name: String(voucher.package_name),
          price_ugx: voucher.price_ugx == null ? null : Number(voucher.price_ugx),
        },
        transaction: {
          id: Number(txRow.id),
          reference: String(txRow.reference),
        },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
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
          v.package_id,
          p.name AS package_name,
          p.duration_minutes
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

      // Phase F: provision MikroTik hotspot user; rollback if it fails.
      await provisionVoucherOnMikroTik({
        voucherCode: voucher.code,
        bundleId: voucher.package_id,
        durationMinutes: voucher.duration_minutes,
        profileName: `hotspot_${voucher.package_id}`,
      });

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

  if (err instanceof MikroTikClientError || err instanceof MikroTikProvisioningError) {
    return {
      httpStatus: err.httpStatus ?? 502,
      body: {
        success: false,
        error: { code: err.code ?? 'MIKROTIK_ERROR', message: err.message ?? 'MikroTik error' },
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
