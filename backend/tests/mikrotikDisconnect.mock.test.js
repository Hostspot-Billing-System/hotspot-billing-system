import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

test('POST /api/mikrotik/disconnect returns success even if not active', async () => {
  process.env.MT_MODE = 'mock';

  const { default: app } = await import('../src/app.js');

  const res = await request(app).post('/api/mikrotik/disconnect').send({ user: 'NOT_ACTIVE' });

  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.removed, 0);
});

test('POST /api/mikrotik/disconnect removes active sessions for user', async () => {
  process.env.MT_MODE = 'mock';

  const { default: app } = await import('../src/app.js');
  const runtime = await import('../src/services/mikrotikRuntime/runtimeService.js');

  const client = runtime.getMikroTikRuntimeClient();
  client.__seedActiveSession({ id: '*ACTIVE1', user: 'ABC123', address: '10.0.0.2', mac_address: 'AA' });

  const before = await request(app).get('/api/runtime/hotspot/active').query({ user: 'ABC123' });
  assert.equal(before.status, 200);
  assert.equal(before.body?.success, true);
  assert.equal(before.body?.data?.length, 1);

  const res = await request(app).post('/api/mikrotik/disconnect').send({ user: 'ABC123' });
  assert.equal(res.status, 200);
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.removed, 1);

  const after = await request(app).get('/api/runtime/hotspot/active').query({ user: 'ABC123' });
  assert.equal(after.status, 200);
  assert.equal(after.body?.success, true);
  assert.equal(after.body?.data?.length, 0);
});
