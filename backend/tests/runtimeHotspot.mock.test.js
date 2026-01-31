import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

// Ensure runtime uses mock client (no router required).
// IMPORTANT: in ESM, static imports are evaluated before this file body runs.
// So we must set env vars first, then dynamically import app/runtime modules.
process.env.MT_MODE = 'mock';

async function loadRuntime() {
  const [{ default: app }, runtime] = await Promise.all([
    import('../src/app.js'),
    import('../src/services/mikrotikRuntime/runtimeService.js'),
  ]);

  return {
    app,
    getMikroTikRuntimeClient: runtime.getMikroTikRuntimeClient,
    closeMikroTikRuntimeClient: runtime.closeMikroTikRuntimeClient,
  };
}

test('Phase F runtime: create, disable, enable, read hotspot user (mock)', async (t) => {
  const { app, closeMikroTikRuntimeClient } = await loadRuntime();
  await closeMikroTikRuntimeClient();

  const username = 'VOUCHER-ABC-123';

  const createRes = await request(app)
    .post('/api/runtime/hotspot/users')
    .send({
      username,
      password: 'secret',
      profile: 'default',
      limit_uptime: '2h',
    });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body?.success, true);
  assert.equal(createRes.body?.action, 'created');
  assert.equal(createRes.body?.user?.username, username);
  assert.equal(createRes.body?.user?.limit_uptime, '2h');
  assert.equal(createRes.body?.user?.disabled, false);

  const disableRes = await request(app).post(`/api/runtime/hotspot/users/${encodeURIComponent(username)}/disable`);
  assert.equal(disableRes.status, 200);
  assert.equal(disableRes.body?.success, true);
  assert.equal(disableRes.body?.user?.disabled, true);

  const enableRes = await request(app).post(`/api/runtime/hotspot/users/${encodeURIComponent(username)}/enable`);
  assert.equal(enableRes.status, 200);
  assert.equal(enableRes.body?.success, true);
  assert.equal(enableRes.body?.user?.disabled, false);

  const getRes = await request(app).get(`/api/runtime/hotspot/users/${encodeURIComponent(username)}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body?.success, true);
  assert.equal(getRes.body?.user?.username, username);
});

test('Phase F runtime: list active sessions (mock)', async () => {
  const { app, getMikroTikRuntimeClient, closeMikroTikRuntimeClient } = await loadRuntime();
  await closeMikroTikRuntimeClient();

  // Seed mock session
  const client = getMikroTikRuntimeClient();
  assert.equal(typeof client.__seedActiveSession, 'function');
  client.__seedActiveSession({
    user: 'VOUCHER-ACTIVE',
    address: '10.10.10.10',
    mac_address: 'AA:BB:CC:DD:EE:FF',
    uptime: '5m',
    bytes_in: 1234,
    bytes_out: 5678,
  });

  const resAll = await request(app).get('/api/runtime/hotspot/active');
  assert.equal(resAll.status, 200);
  assert.equal(resAll.body?.success, true);
  assert.ok(Array.isArray(resAll.body?.data));
  assert.ok(resAll.body.data.length >= 1);

  const resFiltered = await request(app).get('/api/runtime/hotspot/active').query({ user: 'VOUCHER-ACTIVE' });
  assert.equal(resFiltered.status, 200);
  assert.equal(resFiltered.body?.success, true);
  assert.ok(resFiltered.body.data.every((s) => s.user === 'VOUCHER-ACTIVE'));
});
