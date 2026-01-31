import crypto from 'crypto';

import { pool } from '../config/db.js';
import { calculateWithdrawal } from '../services/withdrawalsService.js';
import { WithdrawalsService as WithdrawalsDbService, toHttpError as toHttpErrorDb } from '../services/withdrawalsDbService.js';

function normalizeText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function parsePositiveInt(value, fieldName) {
  const trimmed = String(value ?? '').trim();
  const n = Number(trimmed);
  if (!trimmed || !Number.isFinite(n) || n <= 0) {
    return { ok: false, code: 'BAD_REQUEST', message: `${fieldName} must be a valid number` };
  }
  return { ok: true, value: Math.floor(n) };
}

function maskContact(value) {
  const s = String(value ?? '').trim();
  if (!s) return '********';
  const keep = 4;
  return `******${s.slice(-keep)}`;
}

function generateOtp() {
  const n = crypto.randomInt(0, 1000000);
  return String(n).padStart(6, '0');
}

function hashOtp(otp) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .createHash('sha256')
    .update(`${salt}:${String(otp ?? '')}`)
    .digest('hex');
  return `${salt}$${hash}`;
}

function verifyOtp({ otp, stored }) {
  const raw = String(stored ?? '');
  const parts = raw.split('$');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const computed = crypto
    .createHash('sha256')
    .update(`${salt}:${String(otp ?? '')}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}

function generateReference() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const rand = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `WD-${date}-${rand}`;
}

async function sendOtpMock() {
  return;
}

async function mockMobileMoneyPayout() {
  return { ok: true };
}

function toBadRequest(message) {
  return { success: false, error: { code: 'BAD_REQUEST', message } };
}

async function getAvailableBalanceForClient(clientId) {
  const id = Number(clientId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const earnedRes = await pool.query(
    `
    SELECT COALESCE(SUM(t.net_amount), 0)::float8 AS earned
    FROM transactions t
    WHERE t.client_id = $1
      AND t.status = 'completed'
      AND t.paid_at IS NOT NULL
    `,
    [id]
  );
  const earned = Number(earnedRes.rows?.[0]?.earned ?? 0);

  const withdrawnRes = await pool.query(
    `
    SELECT COALESCE(SUM(w.net_amount), 0)::float8 AS withdrawn
    FROM withdrawals w
    WHERE w.client_id = $1
      AND w.status <> 'failed'
    `,
    [id]
  );
  const withdrawn = Number(withdrawnRes.rows?.[0]?.withdrawn ?? 0);

  return earned - withdrawn;
}

export async function previewWithdrawal(req, res) {
  try {
    const amount = req.body?.amount;
    let preview;
    try {
      preview = calculateWithdrawal(amount);
    } catch {
      return res.status(400).json(toBadRequest('amount must be a valid number'));
    }

    if (!preview.allowed) {
      return res.status(400).json({
        success: false,
        error: { code: 'MIN_AMOUNT', message: 'Minimum withdrawal amount is UGX 500.' },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        requested_amount: preview.requested_amount,
        commission_amount: preview.commission_amount,
        withdrawal_fee: preview.withdrawal_fee,
        net_amount: preview.net_amount,
      },
    });
  } catch (err) {
    const { httpStatus, body } = toHttpErrorDb(err);
    return res.status(httpStatus).json(body);
  }
}

export async function requestWithdrawal(req, res) {
  try {
    const body = req.body ?? {};

    // Backward-compatible: if existing admin UI posts payout_method/payout_account
    // use the legacy DB-backed withdrawal aggregation flow.
    if (body.payout_method != null || body.payout_account != null) {
      const created = await WithdrawalsDbService.requestWithdrawal({
        payout_method: body.payout_method,
        payout_account: body.payout_account,
        agent_id: body.agent_id,
        client_id: body.client_id,
      });

      return res.status(201).json({
        success: true,
        data: created,
      });
    }

    const payoutPhone = normalizeText(body.payout_phone);

    if (!payoutPhone) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'payout_phone is required' },
      });
    }

    let preview;
    try {
      preview = calculateWithdrawal(body.amount);
    } catch {
      return res.status(400).json(toBadRequest('amount must be a valid number'));
    }
    if (!preview.allowed) {
      return res.status(400).json({
        success: false,
        error: { code: 'MIN_AMOUNT', message: 'Minimum withdrawal amount is UGX 500.' },
      });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const verificationContact = maskContact(payoutPhone);

    const clientId = body.client_id == null ? null : Number(body.client_id);
    if (body.client_id != null) {
      const clientParsed = parsePositiveInt(body.client_id, 'client_id');
      if (!clientParsed.ok) {
        return res
          .status(400)
          .json({ success: false, error: { code: clientParsed.code, message: clientParsed.message } });
      }

      const available = await getAvailableBalanceForClient(clientParsed.value);
      if (available != null && preview.requested_amount > available) {
        return res.status(409).json({
          success: false,
          error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance for this withdrawal amount' },
        });
      }
    }

    let created = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = generateReference();
      try {
        const result = await pool.query(
          `
          INSERT INTO withdrawals (
            reference,
            client_id,
            total_amount,
            commission_amount,
            net_amount,
            requested_amount,
            payout_phone,
            verification_contact,
            otp_hash,
            otp_expires_at,
            status,
            payout_method,
            payout_account,
            requested_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending_otp', 'mobile_money', $7, NOW(), NOW(), NOW())
          RETURNING id, verification_contact, otp_expires_at
          `,
          [
            reference,
            clientId,
            preview.requested_amount,
            preview.commission_amount,
            preview.net_amount,
            preview.requested_amount,
            payoutPhone,
            verificationContact,
            otpHash,
            otpExpiresAt.toISOString(),
          ]
        );
        created = result.rows?.[0] ?? null;
        break;
      } catch (e) {
        if (e?.code === '23505') continue;
        throw e;
      }
    }

    if (!created) {
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to generate withdrawal reference' },
      });
    }

    await sendOtpMock({ contact: verificationContact, otp });

    return res.status(201).json({
      success: true,
      data: {
        withdrawal_id: Number(created.id),
        verification_contact: created.verification_contact,
        otp_expires_at: created.otp_expires_at ? new Date(created.otp_expires_at).toISOString() : otpExpiresAt.toISOString(),
      },
    });
  } catch (err) {
    const { httpStatus, body } = toHttpErrorDb(err);
    return res.status(httpStatus).json(body);
  }
}

export async function verifyWithdrawal(req, res) {
  const client = await pool.connect();
  try {
    const body = req.body ?? {};
    const idParsed = parsePositiveInt(body.withdrawal_id, 'withdrawal_id');
    if (!idParsed.ok) {
      return res.status(400).json({ success: false, error: { code: idParsed.code, message: idParsed.message } });
    }

    const otp = normalizeText(body.otp);
    if (!otp) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'otp is required' },
      });
    }

    await client.query('BEGIN');

    const wRes = await client.query(
      `
      SELECT id, status, otp_hash, otp_expires_at
      FROM withdrawals
      WHERE id = $1
      FOR UPDATE
      `,
      [idParsed.value]
    );

    const row = wRes.rows?.[0] ?? null;
    if (!row) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: { code: 'WITHDRAWAL_NOT_FOUND', message: 'Withdrawal not found' },
      });
    }

    const status = String(row.status ?? '');
    if (status !== 'pending_otp') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Withdrawal is not pending OTP (status: ${status})` },
      });
    }

    const expires = row.otp_expires_at ? new Date(row.otp_expires_at) : null;
    if (!expires || Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
      await client.query(
        `
        UPDATE withdrawals
        SET status = 'failed', failure_reason = 'OTP expired', updated_at = NOW()
        WHERE id = $1
        `,
        [idParsed.value]
      );
      await client.query('COMMIT');
      return res.status(400).json({
        success: false,
        error: { code: 'OTP_EXPIRED', message: 'OTP has expired' },
      });
    }

    if (!verifyOtp({ otp, stored: row.otp_hash })) {
      await client.query(
        `
        UPDATE withdrawals
        SET status = 'failed', failure_reason = 'Invalid OTP', updated_at = NOW()
        WHERE id = $1
        `,
        [idParsed.value]
      );
      await client.query('COMMIT');
      return res.status(400).json({
        success: false,
        error: { code: 'OTP_INVALID', message: 'Invalid OTP' },
      });
    }

    await client.query(
      `
      UPDATE withdrawals
      SET status = 'processing', failure_reason = NULL, updated_at = NOW()
      WHERE id = $1
      `,
      [idParsed.value]
    );

    const payout = await mockMobileMoneyPayout();
    if (!payout?.ok) {
      await client.query(
        `
        UPDATE withdrawals
        SET status = 'failed', failure_reason = $2, updated_at = NOW()
        WHERE id = $1
        `,
        [idParsed.value, String(payout?.reason ?? 'Payout failed')]
      );
      await client.query('COMMIT');
      return res.status(502).json({
        success: false,
        error: { code: 'PAYOUT_FAILED', message: 'Payout failed' },
      });
    }

    await client.query(
      `
      UPDATE withdrawals
      SET status = 'completed', completed_at = NOW(), failure_reason = NULL, updated_at = NOW()
      WHERE id = $1
      `,
      [idParsed.value]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      data: { withdrawal_id: idParsed.value, status: 'completed' },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore
    }
    const { httpStatus, body } = toHttpErrorDb(err);
    return res.status(httpStatus).json(body);
  } finally {
    client.release();
  }
}

export async function getWithdrawableBalance(req, res) {
  try {
    const summary = await WithdrawalsDbService.getWithdrawableSummary({
      agent_id: req.query?.agent_id,
      client_id: req.query?.client_id,
    });

    return res.status(200).json({
      success: true,
      total_earnings_ugx: summary.total_earnings_ugx,
      commission_deducted_ugx: summary.commission_deducted_ugx,
      withdrawable_amount_ugx: summary.withdrawable_amount_ugx,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpErrorDb(err);
    return res.status(httpStatus).json(body);
  }
}

export async function listWithdrawals(req, res) {
  try {
    const result = await WithdrawalsDbService.listWithdrawals({
      page: req.query?.page,
      perPage: req.query?.perPage ?? req.query?.per_page,
    });

    return res.status(200).json({
      success: true,
      meta: result.meta,
      data: result.data,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpErrorDb(err);
    return res.status(httpStatus).json(body);
  }
}

export async function getWithdrawalById(req, res) {
  try {
    const result = await WithdrawalsDbService.getWithdrawalById(req.params?.id);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    const { httpStatus, body } = toHttpErrorDb(err);
    return res.status(httpStatus).json(body);
  }
}
