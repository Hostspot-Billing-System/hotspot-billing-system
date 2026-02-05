import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';

// Ensure env is set BEFORE importing app/services (ESM).
process.env.SMS_MOCK = 'true';
process.env.MIKROTIK_MOCK = 'true';
process.env.PORTAL_CALLBACK_SECRET = process.env.PORTAL_CALLBACK_SECRET || 'test-callback-secret';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function signCallbackBody(body) {
  const timestamp = String(Date.now());
  const payload = stableStringify(body ?? {});
  const signed = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', String(process.env.PORTAL_CALLBACK_SECRET))
    .update(signed)
    .digest('hex');
  return { timestamp, signature };
}

async function hasTable(query, tableName) {
  const res = await query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = $1
    LIMIT 1
    `,
    [String(tableName)]
  );
  return Boolean(res.rows?.[0]);
}

async function ensurePackage(query) {
  const existing = await query('SELECT id FROM packages ORDER BY id ASC LIMIT 1');
  if (existing.rows?.[0]?.id) return Number(existing.rows[0].id);

  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
  const name = `SMS-SMOKE-${stamp}`;
  const ins = await query(
    `
    INSERT INTO packages (name, duration_minutes, mikrotik_profile, price_ugx, description, is_active)
    VALUES ($1, 60, $2, 1000, 'sms smoke', TRUE)
    RETURNING id
    `,
    [name, `hotspot_${stamp}`]
  );
  return Number(ins.rows[0].id);
}

async function createVoucher(query, packageId) {
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
  const code = `SMSV-${stamp}`;
  const res = await query(
    `
    INSERT INTO vouchers (code, package_id, status, created_at)
    VALUES ($1, $2, 'available', NOW())
    RETURNING id, code
    `,
    [code, Number(packageId)]
  );
  return { id: Number(res.rows[0].id), code: String(res.rows[0].code) };
}

async function createPortalSession(query) {
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
  const hex = crypto.randomBytes(3).toString('hex').toUpperCase();
  const mac = `AA:BB:CC:${hex.slice(0, 2)}:${hex.slice(2, 4)}:${hex.slice(4, 6)}`;
  const ipLast = 10 + (parseInt(hex.slice(0, 2), 16) % 200);
  const ip = `192.168.88.${ipLast}`;
  const res = await query(
    `
    INSERT INTO portal_sessions (mac_address, ip_address, created_at, updated_at)
    VALUES ($1, $2::inet, NOW(), NOW())
    RETURNING id, mac_address, ip_address
    `,
    [mac, ip]
  );
  return { id: Number(res.rows[0].id), mac_address: res.rows[0].mac_address, ip_address: String(res.rows[0].ip_address) };
}

async function createPendingMobileMoneyTx(query, { reference, bundleId, phoneDigits, amountUgx, portalSessionId }) {
  await query(
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
      client_id,
      created_at
    ) VALUES (
      $1,
      NULL,
      $2,
      $3,
      $4,
      NULL,
      'pending',
      'MOBILE_MONEY',
      'MTN',
      $5,
      NOW()
    )
    `,
    [reference, Number(bundleId), String(phoneDigits), Number(amountUgx), Number(portalSessionId)]
  );
}

test('SMS triggers write sms_logs only for allowed events (SMS_MOCK)', async (t) => {
  const { default: app } = await import('../src/app.js');
  const { query } = await import('../src/config/db.js');

  try {
    const needed = ['packages', 'vouchers', 'transactions', 'portal_sessions', 'sms_logs'];
    for (const table of needed) {
      const ok = await hasTable(query, table);
      assert.ok(ok, `Missing table: ${table}`);
    }
  } catch (err) {
    t.skip(`DB/schema not ready (${err?.message ?? 'unknown'})`);
    return;
  }

  const bundleId = await ensurePackage(query);

  // 1) Direct voucher sale should log SMS
  const voucher = await createVoucher(query, bundleId);

  const beforeDirect = await query("SELECT COUNT(*)::int AS c FROM sms_logs WHERE purpose = 'customer_voucher'");
  const beforeDirectCount = Number(beforeDirect.rows?.[0]?.c ?? 0);

  const directRes = await request(app)
    .post(`/api/vouchers/${voucher.id}/direct-sale`)
    .send({ phone_number: '0700000001', customer_name: 'Smoke', notes: 'sms test' });

  assert.equal(directRes.status, 200);
  assert.equal(directRes.body?.success, true);

  const afterDirect = await query("SELECT COUNT(*)::int AS c FROM sms_logs WHERE purpose = 'customer_voucher'");
  const afterDirectCount = Number(afterDirect.rows?.[0]?.c ?? 0);
  assert.ok(afterDirectCount >= beforeDirectCount + 1, 'Expected at least one customer_voucher SMS log');

  const lastDirect = await query(
    "SELECT success, response_body, to_number FROM sms_logs WHERE purpose = 'customer_voucher' ORDER BY id DESC LIMIT 1"
  );
  assert.equal(Boolean(lastDirect.rows?.[0]?.success), true);
  assert.equal(String(lastDirect.rows?.[0]?.response_body ?? ''), 'MOCK');
  assert.ok(String(lastDirect.rows?.[0]?.to_number ?? '').includes('+256'));

  // 2) Mobile money SUCCESS callback should log SMS
  const session = await createPortalSession(query);
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
  const reference = `SMS-CB-${stamp}`;

  await createPendingMobileMoneyTx(query, {
    reference,
    bundleId,
    phoneDigits: '256700000001',
    amountUgx: 1000,
    portalSessionId: session.id,
  });

  const beforeCb = await query("SELECT COUNT(*)::int AS c FROM sms_logs WHERE purpose = 'mobile_money_success'");
  const beforeCbCount = Number(beforeCb.rows?.[0]?.c ?? 0);

  const cbBody = { reference, status: 'success', provider: 'MTN' };
  const sig = signCallbackBody(cbBody);

  const cbRes = await request(app)
    .post('/api/portal/payment-callback')
    .set('x-timestamp', sig.timestamp)
    .set('x-signature', sig.signature)
    .send(cbBody);

  assert.equal(cbRes.status, 200);
  assert.equal(cbRes.body?.success, true);
  assert.equal(cbRes.body?.data?.status, 'completed');

  const afterCb = await query("SELECT COUNT(*)::int AS c FROM sms_logs WHERE purpose = 'mobile_money_success'");
  const afterCbCount = Number(afterCb.rows?.[0]?.c ?? 0);
  assert.ok(afterCbCount >= beforeCbCount + 1, 'Expected at least one mobile_money_success SMS log');

  const lastCb = await query(
    "SELECT success, response_body, to_number FROM sms_logs WHERE purpose = 'mobile_money_success' ORDER BY id DESC LIMIT 1"
  );
  assert.equal(Boolean(lastCb.rows?.[0]?.success), true);
  assert.equal(String(lastCb.rows?.[0]?.response_body ?? ''), 'MOCK');

  // 3) Failed callback should NOT log SMS
  const referenceFail = `SMS-CB-FAIL-${stamp}`;
  await createPendingMobileMoneyTx(query, {
    reference: referenceFail,
    bundleId,
    phoneDigits: '256700000002',
    amountUgx: 1000,
    portalSessionId: session.id,
  });

  const beforeFail = await query("SELECT COUNT(*)::int AS c FROM sms_logs WHERE purpose = 'mobile_money_success'");
  const beforeFailCount = Number(beforeFail.rows?.[0]?.c ?? 0);

  const failBody = { reference: referenceFail, status: 'failed', provider: 'MTN' };
  const sigFail = signCallbackBody(failBody);

  const failRes = await request(app)
    .post('/api/portal/payment-callback')
    .set('x-timestamp', sigFail.timestamp)
    .set('x-signature', sigFail.signature)
    .send(failBody);

  assert.equal(failRes.status, 200);
  assert.equal(failRes.body?.success, true);
  assert.equal(failRes.body?.data?.status, 'failed');

  const afterFail = await query("SELECT COUNT(*)::int AS c FROM sms_logs WHERE purpose = 'mobile_money_success'");
  const afterFailCount = Number(afterFail.rows?.[0]?.c ?? 0);
  assert.equal(afterFailCount, beforeFailCount, 'Failed payments must not send SMS');
});
