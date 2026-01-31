import process from 'node:process';
import assert from 'node:assert/strict';
import request from 'supertest';

const REAL_MODE = String(process.env.REAL_MODE ?? '').toLowerCase() === 'true';

if (!REAL_MODE) {
  // Default to mock for local smoke runs.
  process.env.MIKROTIK_MOCK = process.env.MIKROTIK_MOCK ?? 'true';
}

function step(title) {
  console.log(`\n[smokeMikrotikIntegration] ${title}`);
}

function randomCode() {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SMOKE${ts}${rnd}`;
}

async function main() {
  const { default: app } = await import('../src/app.js');
  const { query, pool, seedDefaultPackagesIfEmpty } = await import('../src/config/db.js');
  const { getMikroTikMockState } = await import('../src/services/mikrotikMockState.js');
  const { enforceExpiredVouchersOnce } = await import('../src/services/mikrotikExpiryService.js');

  await seedDefaultPackagesIfEmpty();

  const code = randomCode();
  const packageId = 1;

  // Create a new voucher in DB.
  step('Create DB voucher');
  await query(
    `
    INSERT INTO vouchers (code, package_id, status, expires_at)
    VALUES ($1, $2, 'available'::voucher_status, NOW() + interval '1 hour')
    `,
    [code, packageId]
  );

  try {
    // 1) Mock connect to router (or real router if REAL_MODE)
    step('1) Router status (connectivity)');
    const statusRes = await request(app).get('/api/mikrotik/status');
    assert.equal(statusRes.status, 200);
    assert.equal(typeof statusRes.body?.connected, 'boolean');

    if (REAL_MODE) {
      assert.equal(statusRes.body.connected, true);
    } else {
      // In mock mode, should always be connected with realistic values.
      assert.equal(statusRes.body.connected, true);
      assert.ok(statusRes.body.uptime);
      assert.ok(Number.isFinite(statusRes.body.cpu_load));
      assert.ok(Number.isFinite(statusRes.body.memory_free));
      assert.ok(Number.isFinite(statusRes.body.active_users));
    }

    // 2) Redeem voucher -> hotspot user created
    step('2) Redeem voucher (provisions hotspot user)');
    const redeemRes = await request(app).post('/api/vouchers/redeem').send({ code });
    assert.equal(redeemRes.status, 200);
    assert.equal(redeemRes.body?.success, true);

    const userRes = await request(app).get(`/api/runtime/hotspot/users/${encodeURIComponent(code)}`);
    assert.equal(userRes.status, 200);
    assert.equal(userRes.body?.success, true);
    assert.equal(userRes.body?.user?.username, code);
    assert.equal(Boolean(userRes.body?.user?.disabled), false);

    // 3) Fetch active sessions -> user appears
    step('3) Fetch active sessions (user should appear)');

    if (!REAL_MODE) {
      // Simulate the user being actively logged in.
      const state = getMikroTikMockState();
      state.active.push({
        id: `*ACTIVE${state.nextId++}`,
        user: code,
        address: '10.0.0.99',
        mac_address: 'AA:BB:CC:DD:EE:FF',
        uptime: '00:05:00',
        bytes_in: 1234,
        bytes_out: 5678,
      });

      const sessionsRes = await request(app).get('/api/mikrotik/sessions');
      assert.equal(sessionsRes.status, 200);
      assert.equal(sessionsRes.body?.success, true);

      const list = sessionsRes.body?.data ?? [];
      const found = list.find((s) => s.user === code);
      assert.ok(found, 'expected active session for voucher user');
      assert.ok(found.package_name, 'expected package_name from DB join');
      assert.equal(found.ip, '10.0.0.99');
      assert.equal(found.mac, 'AA:BB:CC:DD:EE:FF');
      assert.equal(found.bytes_in, 1234);
      assert.equal(found.bytes_out, 5678);
    } else {
      // Real router mode: we can only assert the endpoint works; actual session requires real client login.
      const sessionsRes = await request(app).get('/api/mikrotik/sessions');
      assert.equal(sessionsRes.status, 200);
      assert.equal(sessionsRes.body?.success, true);
    }

    // 4) Disconnect user -> session removed
    step('4) Disconnect user');
    const disconnectRes = await request(app).post('/api/mikrotik/disconnect').send({ user: code });
    assert.equal(disconnectRes.status, 200);
    assert.equal(disconnectRes.body?.success, true);

    if (!REAL_MODE) {
      assert.equal(disconnectRes.body?.removed, 1);

      const sessionsRes2 = await request(app).get('/api/mikrotik/sessions');
      const list2 = sessionsRes2.body?.data ?? [];
      const stillThere = list2.find((s) => s.user === code);
      assert.equal(stillThere, undefined);
    }

    // 5) Expire voucher -> user disabled
    step('5) Expire voucher and enforce MikroTik disable');
    await query(
      `
      UPDATE vouchers
      SET status = 'expired'::voucher_status,
          used_at = NULL
      WHERE code = $1
      `,
      [code]
    );

    await enforceExpiredVouchersOnce({ pageSize: 100 });

    const userRes2 = await request(app).get(`/api/runtime/hotspot/users/${encodeURIComponent(code)}`);
    assert.equal(userRes2.status, 200);
    assert.equal(userRes2.body?.success, true);
    assert.equal(Boolean(userRes2.body?.user?.disabled), true);

    console.log('\n[smokeMikrotikIntegration] ✅ PASS');
  } finally {
    // Cleanup DB voucher (leave router user disabled as per requirements).
    await query('DELETE FROM vouchers WHERE code = $1', [code]).catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('\n[smokeMikrotikIntegration] ❌ FAIL');
  console.error(err);
  process.exit(1);
});
