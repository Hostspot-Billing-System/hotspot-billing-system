import test from 'node:test';
import assert from 'node:assert/strict';

import { getMikroTikStatus } from '../src/services/mikrotikStatusService.js';

test('mikrotikStatusService: returns mapped system resource + active users', async () => {
  const mikrotikClient = {
    async connect() {},
    async close() {},
    async exec(command) {
      if (command === '/system/resource/print') {
        return [{ uptime: '1d 02:03:04', 'cpu-load': '7', 'free-memory': '123456' }];
      }
      if (command === '/ip/hotspot/active/print') {
        return [{ user: 'A' }, { user: 'A' }, { user: 'B' }];
      }
      throw new Error('unexpected');
    },
  };

  const status = await getMikroTikStatus({ mikrotikClient });
  assert.deepEqual(status, {
    connected: true,
    uptime: '1d 02:03:04',
    cpu_load: 7,
    memory_free: 123456,
    active_users: 2,
  });
});

test('mikrotikStatusService: returns connected=false shape on failure', async () => {
  const mikrotikClient = {
    async connect() {
      throw new Error('nope');
    },
    async close() {},
  };

  const status = await getMikroTikStatus({ mikrotikClient });
  assert.equal(status.connected, false);
  assert.equal(status.uptime, null);
  assert.equal(status.cpu_load, null);
  assert.equal(status.memory_free, null);
  assert.equal(status.active_users, null);
});
