import { pool } from '../config/db.js';

class DomainError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function normalizeVoucherCode(code) {
  return String(code ?? '').trim();
}

function normalizeMacAddress(mac) {
  return String(mac ?? '').trim();
}

function normalizeIpAddress(ip) {
  const value = String(ip ?? '').trim();
  return value === '' ? null : value;
}

function isExpired(voucherRow) {
  if (!voucherRow.expires_at) return false;
  return new Date(voucherRow.expires_at).getTime() <= Date.now();
}

export class VoucherService {
  static async findVoucherByCode(code) {
    const normalizedCode = normalizeVoucherCode(code);

    if (!normalizedCode) {
      throw new DomainError('BAD_REQUEST', 'voucher_code is required', 400);
    }

    const result = await pool.query(
      `
      SELECT
        v.id,
        v.code,
        v.status,
        v.expires_at,
        v.used_at,
        v.created_at,
        v.package_id,
        p.name AS package_name,
        p.duration_minutes,
        p.mikrotik_profile
      FROM vouchers v
      JOIN packages p ON p.id = v.package_id
      WHERE v.code = $1
      `,
      [normalizedCode]
    );

    return result.rows[0] ?? null;
  }

  static validateVoucherForLogin(voucherRow) {
    if (!voucherRow) {
      throw new DomainError('VOUCHER_NOT_FOUND', 'Voucher not found', 404);
    }

    if (voucherRow.status !== 'available') {
      throw new DomainError(
        'VOUCHER_NOT_AVAILABLE',
        `Voucher is not available (status: ${voucherRow.status})`,
        409
      );
    }

    if (isExpired(voucherRow)) {
      throw new DomainError('VOUCHER_EXPIRED', 'Voucher is expired', 410);
    }
  }

  static async markVoucherAsUsedTransactional(client, voucherId) {
    const result = await client.query(
      `
      UPDATE vouchers
      SET status = 'used', used_at = NOW()
      WHERE id = $1
      RETURNING id, status, used_at
      `,
      [voucherId]
    );

    if (result.rowCount !== 1) {
      throw new DomainError('VOUCHER_UPDATE_FAILED', 'Failed to mark voucher as used', 500);
    }

    return result.rows[0];
  }

  static async createHotspotSessionTransactional(client, { voucherId, macAddress, ipAddress }) {
    const result = await client.query(
      `
      INSERT INTO hotspot_sessions (voucher_id, mac_address, ip_address)
      VALUES ($1, $2, $3)
      RETURNING id, voucher_id, mac_address, ip_address, started_at
      `,
      [voucherId, macAddress, ipAddress]
    );

    return result.rows[0];
  }

  // Main Phase 2C operation: validate + mark used + create session (atomic)
  static async redeemVoucherForSession({ voucher_code, mac_address, ip_address }) {
    const code = normalizeVoucherCode(voucher_code);
    const macAddress = normalizeMacAddress(mac_address);
    const ipAddress = normalizeIpAddress(ip_address);

    if (!code) {
      throw new DomainError('BAD_REQUEST', 'voucher_code is required', 400);
    }

    if (!macAddress) {
      throw new DomainError('BAD_REQUEST', 'mac_address is required', 400);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the voucher row to prevent concurrent reuse.
      const voucherResult = await client.query(
        `
        SELECT
          v.id,
          v.code,
          v.status,
          v.expires_at,
          v.used_at,
          v.created_at,
          v.package_id,
          p.name AS package_name,
          p.duration_minutes,
          p.mikrotik_profile
        FROM vouchers v
        JOIN packages p ON p.id = v.package_id
        WHERE v.code = $1
        FOR UPDATE
        `,
        [code]
      );

      const voucher = voucherResult.rows[0] ?? null;
      this.validateVoucherForLogin(voucher);

      // Re-check expiry inside the transaction using DB time.
      if (voucher.expires_at) {
        const expiryCheck = await client.query('SELECT NOW() >= $1::timestamptz AS expired', [
          voucher.expires_at,
        ]);
        if (expiryCheck.rows[0]?.expired) {
          throw new DomainError('VOUCHER_EXPIRED', 'Voucher is expired', 410);
        }
      }

      const updatedVoucher = await this.markVoucherAsUsedTransactional(client, voucher.id);
      const session = await this.createHotspotSessionTransactional(client, {
        voucherId: voucher.id,
        macAddress,
        ipAddress,
      });

      await client.query('COMMIT');

      return {
        voucher: {
          id: voucher.id,
          code: voucher.code,
          status: updatedVoucher.status,
          used_at: updatedVoucher.used_at,
          expires_at: voucher.expires_at,
          package: {
            id: voucher.package_id,
            name: voucher.package_name,
            duration_minutes: voucher.duration_minutes,
            mikrotik_profile: voucher.mikrotik_profile,
          },
        },
        session,
      };
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
