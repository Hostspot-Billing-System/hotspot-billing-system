import { pool, query } from '../config/db.js';
import { TransactionsService } from '../services/transactionsService.js';
import {
  flutterwaveChargeMobileMoneyUganda,
  flutterwaveVerifyTransaction,
  normalizeUgPhoneForFlutterwave,
  normalizeUgandaNetwork,
  toFlutterwaveHttpError,
} from '../services/flutterwaveService.js';

function normalizeText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function normalizeTxStatus(dbStatus) {
  const s = String(dbStatus ?? '').trim().toLowerCase();
  if (s === 'completed' || s === 'success') return 'successful';
  if (s === 'failed') return 'failed';
  if (s === 'pending') return 'pending';
  return s || 'pending';
}

function isUndefinedColumn(err) {
  return err && err.code === '42703';
}

async function safeQueryTransactional(client, sql, params) {
  try {
    await client.query(sql, params);
  } catch (err) {
    if (isUndefinedColumn(err)) return;
    throw err;
  }
}

async function resolveBundleByIdOrNameTransactional(client, bundleId) {
  const raw = normalizeText(bundleId);
  if (!raw) {
    const err = new Error('bundleId is required');
    err.code = 'BAD_REQUEST';
    err.httpStatus = 400;
    throw err;
  }

  // Prefer numeric id (matches existing bundles API).
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) {
    return TransactionsService.getActiveBundleForPortalPurchaseTransactional(client, { bundle_id: Math.floor(asNum) });
  }

  // Back-compat for callers that send semantic ids like "daily".
  const key = raw.toLowerCase();
  const like =
    key === '2h'
      ? '%2 hour%'
      : key === '12h'
        ? '%12 hour%'
        : key === 'daily'
          ? '%daily%'
          : key === 'weekly'
            ? '%weekly%'
            : key === 'monthly'
              ? '%month%'
              : `%${key}%`;

  const res = await client.query(
    `
    SELECT id
    FROM packages
    WHERE LOWER(name) LIKE LOWER($1)
    ORDER BY id ASC
    LIMIT 1
    `,
    [like]
  );

  const id = res.rows?.[0]?.id;
  if (!id) {
    const err = new Error('Bundle not found');
    err.code = 'BUNDLE_NOT_FOUND';
    err.httpStatus = 404;
    throw err;
  }

  return TransactionsService.getActiveBundleForPortalPurchaseTransactional(client, { bundle_id: Number(id) });
}

export async function initiateFlutterwaveMobileMoneyPayment(req, res) {
  let client;
  try {
    const phoneNumber = req.body?.phoneNumber ?? req.body?.phone_number ?? req.body?.phone;
    const bundleId = req.body?.bundleId ?? req.body?.bundle_id;
    const networkRaw = req.body?.network ?? req.body?.payment_provider ?? req.body?.provider;

    const phone = normalizeUgPhoneForFlutterwave(phoneNumber);
    const network = normalizeUgandaNetwork(networkRaw);

    client = await pool.connect();
    await client.query('BEGIN');

    const bundle = await resolveBundleByIdOrNameTransactional(client, bundleId);

    const tx = await TransactionsService.createPendingPortalBuyTransactionTransactional(client, {
      bundle_id: bundle.id,
      customer_phone: phone.e164,
      amount_ugx: bundle.price_ugx,
      payment_provider: network,
    });

    // Tag the transaction as flutterwave for audit/reconciliation.
    await safeQueryTransactional(
      client,
      `
        UPDATE transactions
        SET source = COALESCE(source, 'flutterwave'),
            flutterwave_tx_ref = COALESCE(flutterwave_tx_ref, reference)
        WHERE reference = $1
      `,
      [tx.reference]
    );

    await client.query('COMMIT');

    // Initiate payment with Flutterwave (outside DB tx).
    let flw;
    try {
      flw = await flutterwaveChargeMobileMoneyUganda({
        tx_ref: tx.reference,
        amount: bundle.price_ugx,
        currency: 'UGX',
        network,
        email: 'customer@hotspot.local',
        phone_number: phone.compact,
        fullname: 'Hotspot Customer',
      });
    } catch (err) {
      await TransactionsService.markTransactionFailedByReference(tx.reference, {
        failure_reason: err?.message ?? 'Payment initiation failed',
        payment_provider: network,
      });
      const http = toFlutterwaveHttpError(err);
      return res.status(http.httpStatus).json(http.body);
    }

    // Persist Flutterwave id if present.
    const flwId = flw?.data?.id ?? flw?.data?.flw_ref ?? null;
    if (flwId) {
      try {
        await query(
          `
          UPDATE transactions
          SET flutterwave_id = $2,
              updated_at = NOW()
          WHERE reference = $1
          `,
          [tx.reference, String(flwId).slice(0, 100)]
        );
      } catch {
        // best-effort only
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        tx_ref: tx.reference,
        status: 'pending',
        message: 'Please approve payment on your phone',
        flutterwave: {
          status: flw?.status ?? null,
          message: flw?.message ?? null,
        },
      },
    });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
    }

    const code = String(err?.code ?? '').trim();
    const httpStatus = Number(err?.httpStatus) || (code === 'BAD_REQUEST' ? 400 : 500);

    return res.status(httpStatus).json({
      success: false,
      error: {
        code: code || (httpStatus === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR'),
        message: err?.message ?? 'Internal server error',
      },
    });
  } finally {
    if (client) client.release();
  }
}

export async function flutterwaveWebhookHandler(req, res) {
  const secret = String(process.env.FLW_WEBHOOK_SECRET ?? '').trim();
  const hash = String(req.headers['verif-hash'] ?? '').trim();

  if (!secret || hash !== secret) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid webhook hash' } });
  }

  const body = req.body ?? {};
  const data = body?.data ?? body;

  const txRef = normalizeText(data?.tx_ref ?? data?.txRef ?? data?.reference);
  const statusRaw = normalizeText(data?.status);
  const flwId = normalizeText(data?.id ?? data?.flw_ref);

  if (!txRef) {
    return res.status(200).json({ success: true, ignored: true });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const tx = await TransactionsService.getTransactionByReferenceForUpdateTransactional(client, txRef);

    // Idempotency: already terminal.
    if (tx.status === 'completed' || tx.status === 'failed') {
      await client.query('COMMIT');
      return res.status(200).json({ success: true, data: { tx_ref: txRef, status: normalizeTxStatus(tx.status) } });
    }

    // Verify with Flutterwave if we have an id.
    let verified = null;
    if (flwId) {
      try {
        verified = await flutterwaveVerifyTransaction({ id: flwId });
      } catch {
        verified = null;
      }
    }

    const verifiedStatus = normalizeText(verified?.data?.status) ?? statusRaw;
    const ok = String(verifiedStatus ?? '').toLowerCase() === 'successful' || String(verifiedStatus ?? '').toLowerCase() === 'success';

    if (!ok) {
      await TransactionsService.markTransactionFailedTransactional(client, txRef, {
        failure_reason: String(data?.processor_response ?? data?.message ?? data?.narration ?? 'Payment failed').slice(0, 255),
        payment_provider: tx.payment_provider,
        provider_tx_id: flwId,
      });

      await safeQueryTransactional(
        client,
        `
          UPDATE transactions
          SET flutterwave_id = COALESCE(flutterwave_id, $2),
              flutterwave_tx_ref = COALESCE(flutterwave_tx_ref, reference)
          WHERE reference = $1
        `,
        [txRef, flwId]
      );

      await client.query('COMMIT');
      return res.status(200).json({ success: true, data: { tx_ref: txRef, status: 'failed' } });
    }

    // SUCCESS: assign a voucher ONLY now.
    const voucherRes = await client.query(
      `
      SELECT id, code
      FROM vouchers
      WHERE package_id = $1
        AND status = 'available'
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
      `,
      [Number(tx.bundle_id)]
    );

    const voucher = voucherRes.rows?.[0] ?? null;
    if (!voucher?.id || !voucher?.code) {
      await TransactionsService.markTransactionFailedTransactional(client, txRef, {
        failure_reason: 'NO_VOUCHERS_AVAILABLE',
        payment_provider: tx.payment_provider,
        provider_tx_id: flwId,
      });

      await safeQueryTransactional(
        client,
        `
          UPDATE transactions
          SET flutterwave_id = COALESCE(flutterwave_id, $2),
              flutterwave_tx_ref = COALESCE(flutterwave_tx_ref, reference)
          WHERE reference = $1
        `,
        [txRef, flwId]
      );

      await client.query('COMMIT');
      return res.status(200).json({ success: true, data: { tx_ref: txRef, status: 'failed' } });
    }

    try {
      await client.query(
        `
        UPDATE vouchers
        SET status = 'used',
            used_at = NOW(),
            used_by = COALESCE(used_by, $2)
        WHERE id = $1
        `,
        [Number(voucher.id), tx.customer_phone]
      );
    } catch (err) {
      if (!isUndefinedColumn(err)) throw err;
      await client.query(
        `
        UPDATE vouchers
        SET status = 'used',
            used_at = NOW()
        WHERE id = $1
        `,
        [Number(voucher.id)]
      );
    }

    await TransactionsService.markTransactionCompletedTransactional(client, txRef, {
      payment_provider: tx.payment_provider,
      provider_tx_id: flwId,
    });

    await safeQueryTransactional(
      client,
      `
        UPDATE transactions
        SET voucher_id = $2,
            voucher_code = $3,
            source = COALESCE(source, 'flutterwave'),
            flutterwave_id = COALESCE(flutterwave_id, $4),
            flutterwave_tx_ref = COALESCE(flutterwave_tx_ref, reference)
        WHERE reference = $1
      `,
      [txRef, Number(voucher.id), String(voucher.code).slice(0, 50), flwId]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      data: { tx_ref: txRef, status: 'successful', voucher_code: voucher.code },
    });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
    }

    // Webhooks should almost always return 200 to avoid retries storms.
    return res.status(200).json({ success: true, ignored: true });
  } finally {
    if (client) client.release();
  }
}

export async function getPaymentStatusByTxRef(req, res) {
  try {
    const txRef = normalizeText(req.params?.tx_ref);
    if (!txRef) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'tx_ref is required' } });
    }

    const result = await query(
      `
      SELECT
        reference,
        status,
        customer_phone,
        bundle_id,
        bundle_name,
        amount_ugx,
        failure_reason,
        voucher_code,
        created_at
      FROM transactions
      WHERE reference = $1
      LIMIT 1
      `,
      [txRef]
    );

    const row = result.rows?.[0];
    if (!row) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
    }

    // Best-effort timeout handling.
    if (String(row.status ?? '').toLowerCase() === 'pending') {
      const createdAt = row.created_at ? new Date(row.created_at) : null;
      const ageMs = createdAt ? Date.now() - createdAt.getTime() : 0;
      if (createdAt && ageMs > 10 * 60 * 1000) {
        await TransactionsService.markTransactionFailedByReference(txRef, {
          failure_reason: 'TIMEOUT',
          payment_provider: 'NONE',
        });
        row.status = 'failed';
        row.failure_reason = row.failure_reason ?? 'TIMEOUT';
      }
    }

    const status = normalizeTxStatus(row.status);

    return res.status(200).json({
      success: true,
      data: {
        tx_ref: row.reference,
        status,
        phone_number: row.customer_phone ?? null,
        bundle_id: row.bundle_id == null ? null : String(row.bundle_id),
        bundle_name: row.bundle_name ?? null,
        amount: row.amount_ugx == null ? null : Number(row.amount_ugx),
        currency: 'UGX',
        voucher_code: row.voucher_code ?? null,
        message: status === 'pending' ? 'Waiting for payment confirmation' : null,
        failure_reason: status === 'failed' ? row.failure_reason ?? 'Payment failed' : null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
}
