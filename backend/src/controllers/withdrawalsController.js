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

async function lockOwnerLedgerAndGetBalance(client, ownerId) {
  // Ensures no parallel withdrawal flows for the same owner_id even if there are no ledger rows yet.
  await client.query('SELECT pg_advisory_xact_lock($1::bigint) AS locked', [ownerId]);

  const result = await client.query(
    `
    SELECT
      COALESCE(le.balance_after, 0)::numeric(14,2) AS balance,
      le.id AS ledger_entry_id
    FROM (SELECT 1) x
    LEFT JOIN LATERAL (
      SELECT id, balance_after
      FROM ledger_entries
      WHERE owner_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE
    ) le ON true
    `,
    [ownerId]
  );

  const row = result.rows?.[0] ?? null;
  return {
    balance: row?.balance == null ? '0.00' : String(row.balance),
    ledger_entry_id: row?.ledger_entry_id == null ? null : Number(row.ledger_entry_id),
  };
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

function toInvalidWithdrawalState(message) {
  return { success: false, error: { code: 'INVALID_WITHDRAWAL_STATE', message } };
}

async function transitionWithdrawalStatus(client, { withdrawalId, fromStatuses, toStatus, setFailureReason, setCompletedAt }) {
  const params = [withdrawalId];
  const whereStatuses = (fromStatuses ?? []).map((s) => String(s));
  params.push(whereStatuses);

  const setClauses = [`status = '${String(toStatus)}'`, 'updated_at = NOW()'];
  if (setFailureReason !== undefined) {
    params.push(setFailureReason);
    setClauses.push(`failure_reason = $${params.length}`);
  }
  if (setCompletedAt) {
    setClauses.push('completed_at = NOW()');
  }

  const result = await client.query(
    `
    UPDATE withdrawals
    SET ${setClauses.join(', ')}
    WHERE id = $1
      AND status = ANY($2::text[])
    RETURNING status
    `,
    params
  );

  return { ok: (result.rowCount ?? 0) > 0 };
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

    const idempotencyKey = normalizeText(req.get?.('Idempotency-Key') ?? req.headers?.['idempotency-key']);
    if (idempotencyKey) {
      const existingRes = await pool.query(
        `
        SELECT id, verification_contact, otp_expires_at
        FROM withdrawals
        WHERE idempotency_key = $1
        LIMIT 1
        `,
        [idempotencyKey]
      );
      const existing = existingRes.rows?.[0] ?? null;
      if (existing) {
        // If the caller is using the legacy flow, return the full withdrawal contract.
        if (body.payout_method != null || body.payout_account != null) {
          const data = await WithdrawalsDbService.getWithdrawalById(existing.id);
          return res.status(200).json({ success: true, data });
        }

        return res.status(200).json({
          success: true,
          data: {
            withdrawal_id: Number(existing.id),
            verification_contact: existing.verification_contact ?? null,
            otp_expires_at: existing.otp_expires_at ? new Date(existing.otp_expires_at).toISOString() : null,
          },
        });
      }
    }

    // Backward-compatible: if existing admin UI posts payout_method/payout_account
    // use the legacy DB-backed withdrawal aggregation flow.
    if (body.payout_method != null || body.payout_account != null) {
      const created = await WithdrawalsDbService.requestWithdrawal({
        payout_method: body.payout_method,
        payout_account: body.payout_account,
        agent_id: body.agent_id,
        client_id: body.client_id,
        idempotency_key: idempotencyKey,
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

    const ownerParsed = parsePositiveInt(body.owner_id ?? body.client_id, 'owner_id');
    if (!ownerParsed.ok) {
      return res
        .status(400)
        .json({ success: false, error: { code: ownerParsed.code, message: ownerParsed.message } });
    }
    const ownerId = ownerParsed.value;

    const requiredAmount = (preview.requested_amount + preview.withdrawal_fee).toFixed(2);

    const client = await pool.connect();
    let created = null;
    try {
      await client.query('BEGIN');

      // Prevent parallel withdrawals for the same owner.
      const { balance } = await lockOwnerLedgerAndGetBalance(client, ownerId);

      // Disallow starting a second withdrawal while another is active.
      const activeRes = await client.query(
        `
        SELECT id
        FROM withdrawals
        WHERE client_id = $1
          AND status IN ('otp_pending', 'pending_otp', 'processing')
        LIMIT 1
        FOR UPDATE
        `,
        [ownerId]
      );
      if ((activeRes.rows ?? []).length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: { code: 'WITHDRAWAL_IN_PROGRESS', message: 'A withdrawal is already in progress for this account' },
        });
      }

      const balanceCheck = await client.query(
        `
        SELECT ($1::numeric(14,2) >= $2::numeric(14,2)) AS has_funds
        `,
        [balance, requiredAmount]
      );
      const hasFunds = Boolean(balanceCheck.rows?.[0]?.has_funds);
      if (!hasFunds) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance for this withdrawal amount' },
        });
      }

      for (let attempt = 0; attempt < 5; attempt++) {
        const reference = generateReference();
        try {
          const result = await client.query(
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
              idempotency_key,
              status,
              payout_method,
              payout_account,
              requested_at,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'otp_pending', 'mobile_money', $7, NOW(), NOW(), NOW())
            RETURNING id, verification_contact, otp_expires_at
            `,
            [
              reference,
              ownerId,
              preview.requested_amount,
              preview.commission_amount,
              preview.net_amount,
              preview.requested_amount,
              payoutPhone,
              verificationContact,
              otpHash,
              otpExpiresAt.toISOString(),
              idempotencyKey,
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
        throw new Error('Failed to generate withdrawal reference');
      }

      await client.query('COMMIT');
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

    const idempotencyKey = normalizeText(req.get?.('Idempotency-Key') ?? req.headers?.['idempotency-key']);

    if (idempotencyKey) {
      const existingRes = await client.query(
        `
        SELECT id, status
        FROM withdrawals
        WHERE idempotency_key = $1
        LIMIT 1
        `,
        [idempotencyKey]
      );
      const existing = existingRes.rows?.[0] ?? null;
      const existingId = existing?.id == null ? null : Number(existing.id);
      const existingStatus = existing?.status == null ? null : String(existing.status);

      // If the key is already associated to a different withdrawal, or the withdrawal is no longer pending,
      // return the existing response and do not reprocess.
      if (
        existingId &&
        (existingId !== idParsed.value || (existingStatus && existingStatus !== 'otp_pending' && existingStatus !== 'pending_otp'))
      ) {
        return res.status(200).json({
          success: true,
          data: { withdrawal_id: existingId, status: existingStatus ?? 'unknown' },
        });
      }
    }

    await client.query('BEGIN');

    const wRes = await client.query(
      `
      SELECT
        id,
        client_id,
        status,
        otp_hash,
        otp_expires_at,
        requested_amount,
        idempotency_key,
        COALESCE(otp_attempts, 0)::int AS otp_attempts,
        otp_locked_until
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

    if (idempotencyKey) {
      const storedKey = row.idempotency_key == null ? null : String(row.idempotency_key);

      // If a key is already set, it must match.
      if (storedKey && storedKey !== idempotencyKey) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: { code: 'IDEMPOTENCY_KEY_CONFLICT', message: 'Idempotency-Key does not match this withdrawal' },
        });
      }

      // Attach the key if the withdrawal didn't already have one.
      if (!storedKey) {
        await client.query(
          `
          UPDATE withdrawals
          SET idempotency_key = $2
          WHERE id = $1
          `,
          [idParsed.value, idempotencyKey]
        );
      }
    }

    const status = String(row.status ?? '');

    {
      const lockedUntil = row.otp_locked_until ? new Date(row.otp_locked_until) : null;
      const isLocked = lockedUntil && !Number.isNaN(lockedUntil.getTime()) && lockedUntil.getTime() > Date.now();
      const attempts = Number(row.otp_attempts ?? 0);

      if (isLocked || attempts >= 5) {
        // Safety: if attempts are already maxed but lock isn't set (older rows), enforce a lock.
        if (!isLocked) {
          await client.query(
            `
            UPDATE withdrawals
            SET otp_locked_until = NOW() + interval '15 minutes',
                updated_at = NOW()
            WHERE id = $1
            `,
            [idParsed.value]
          );
        }
        await client.query('COMMIT');
        return res.status(429).json({
          success: false,
          error: { code: 'OTP_LOCKED', message: 'Too many OTP attempts. Try again later.' },
        });
      }
    }

    // Idempotency: if already terminal or in-flight, return the current state.
    if (idempotencyKey && (status === 'processing' || status === 'completed' || status === 'failed')) {
      await client.query('COMMIT');
      return res.status(200).json({
        success: true,
        data: { withdrawal_id: idParsed.value, status },
      });
    }

    if (status !== 'otp_pending' && status !== 'pending_otp') {
      await client.query('ROLLBACK');
      return res
        .status(409)
        .json(toInvalidWithdrawalState(`Invalid state transition attempt: ${status} -> processing`));
    }

    const expires = row.otp_expires_at ? new Date(row.otp_expires_at) : null;
    if (!expires || Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: { code: 'OTP_EXPIRED', message: 'OTP has expired' },
      });
    }

    if (!verifyOtp({ otp, stored: row.otp_hash })) {
      const attemptRes = await client.query(
        `
        UPDATE withdrawals
        SET
          otp_attempts = COALESCE(otp_attempts, 0) + 1,
          otp_locked_until = CASE
            WHEN (COALESCE(otp_attempts, 0) + 1) >= 5 THEN NOW() + interval '15 minutes'
            ELSE otp_locked_until
          END,
          updated_at = NOW()
        WHERE id = $1
        RETURNING COALESCE(otp_attempts, 0)::int AS otp_attempts, otp_locked_until
        `,
        [idParsed.value]
      );

      const attemptRow = attemptRes.rows?.[0] ?? null;
      const attempts = Number(attemptRow?.otp_attempts ?? 0);
      const lockedUntil = attemptRow?.otp_locked_until ? new Date(attemptRow.otp_locked_until) : null;
      const isLocked = lockedUntil && !Number.isNaN(lockedUntil.getTime()) && lockedUntil.getTime() > Date.now();

      await client.query('COMMIT');

      if (isLocked || attempts >= 5) {
        return res.status(429).json({
          success: false,
          error: { code: 'OTP_LOCKED', message: 'Too many OTP attempts. Try again later.' },
        });
      }

      return res.status(400).json({
        success: false,
        error: { code: 'OTP_INVALID', message: 'Invalid OTP' },
      });
    }

    {
      const transitioned = await transitionWithdrawalStatus(client, {
        withdrawalId: idParsed.value,
        fromStatuses: ['otp_pending', 'pending_otp'],
        toStatus: 'processing',
        setFailureReason: null,
      });
      if (!transitioned.ok) {
        await client.query('ROLLBACK');
        return res
          .status(409)
          .json(toInvalidWithdrawalState('Invalid state transition attempt: otp_pending -> processing'));
      }
    }

    const payout = await mockMobileMoneyPayout();
    if (!payout?.ok) {
      const transitioned = await transitionWithdrawalStatus(client, {
        withdrawalId: idParsed.value,
        fromStatuses: ['processing'],
        toStatus: 'failed',
        setFailureReason: String(payout?.reason ?? 'Payout failed'),
      });
      if (!transitioned.ok) {
        await client.query('ROLLBACK');
        return res
          .status(409)
          .json(toInvalidWithdrawalState('Invalid state transition attempt: processing -> failed'));
      }
      await client.query('COMMIT');
      return res.status(502).json({
        success: false,
        error: { code: 'PAYOUT_FAILED', message: 'Payout failed' },
      });
    }

    // Only write a ledger entry when the withdrawal becomes 'completed'.
    // Insert ledger entry and update status atomically in this transaction.
    const ownerId = Number(row.client_id);
    if (!Number.isFinite(ownerId) || ownerId <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Withdrawal has no valid owner (client_id)' },
      });
    }

    // Lock owner's ledger row and validate funds at the completion boundary.
    const { balance } = await lockOwnerLedgerAndGetBalance(client, ownerId);
    const requestedAmount = Number(row.requested_amount ?? 0);
    const preview = calculateWithdrawal(requestedAmount);
    const requiredAmount = (preview.requested_amount + preview.withdrawal_fee).toFixed(2);

    const balanceCheck = await client.query(
      `
      SELECT ($1::numeric(14,2) >= $2::numeric(14,2)) AS has_funds
      `,
      [balance, requiredAmount]
    );
    const hasFunds = Boolean(balanceCheck.rows?.[0]?.has_funds);
    if (!hasFunds) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient balance for this withdrawal' },
      });
    }

    // Safety: avoid double-debit if verify is retried in edge cases.
    const existingLedger = await client.query(
      `
      SELECT 1
      FROM ledger_entries
      WHERE source_type = 'withdrawal'
        AND source_id = $1
      LIMIT 1
      `,
      [idParsed.value]
    );
    if ((existingLedger.rows ?? []).length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_DEBITED', message: 'Withdrawal ledger debit already exists' },
      });
    }

    await client.query(
      `
      INSERT INTO ledger_entries (
        owner_id,
        source_type,
        source_id,
        direction,
        amount_ugx,
        balance_after
      )
      VALUES (
        $1,
        'withdrawal',
        $2,
        'debit',
        $3::numeric(14,2),
        ($4::numeric(14,2) - $3::numeric(14,2))::numeric(14,2)
      )
      `,
      [ownerId, idParsed.value, requiredAmount, balance]
    );

    {
      const transitioned = await transitionWithdrawalStatus(client, {
        withdrawalId: idParsed.value,
        fromStatuses: ['processing'],
        toStatus: 'completed',
        setFailureReason: null,
        setCompletedAt: true,
      });
      if (!transitioned.ok) {
        await client.query('ROLLBACK');
        return res
          .status(409)
          .json(toInvalidWithdrawalState('Invalid state transition attempt: processing -> completed'));
      }
    }

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
