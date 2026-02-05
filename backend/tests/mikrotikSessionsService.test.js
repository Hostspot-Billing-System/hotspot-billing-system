import test from 'node:test';
import assert from 'node:assert/strict';

import { getMikroTikActiveSessions } from '../src/services/mikrotikSessionsService.js';

test('mikrotikSessionsService: maps active sessions and joins package name', async () => {
  const listActive = async () => [
    {
      id: '*A1',
      user: 'ABC123',
      address: '10.0.0.2',
      mac_address: 'AA:BB:CC:DD:EE:FF',
      uptime: '00:10:00',
      bytes_in: 100,
      bytes_out: 200,
    },
    {
      id: '*A2',
      user: 'UNKNOWN',
      address: '10.0.0.3',
      mac_address: '11:22:33:44:55:66',
      uptime: '00:01:00',
      bytes_in: 1,
      bytes_out: 2,
    },
  ];

  const dbQuery = async (_sql, params) => {
    assert.deepEqual(params, [['ABC123', 'UNKNOWN']]);
    return {
      rows: [{ code: 'ABC123', package_name: '2 Hours Unlimited' }],
    };
  };

  const sessions = await getMikroTikActiveSessions({ dbQuery, listActive });

  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions[0], {
    user: 'ABC123',
    ip: '10.0.0.2',
    mac: 'AA:BB:CC:DD:EE:FF',
    uptime: '00:10:00',
    bytes_in: 100,
    bytes_out: 200,
    package_name: '2 Hours Unlimited',
  });

  assert.deepEqual(sessions[1], {
    user: 'UNKNOWN',
    ip: '10.0.0.3',
    mac: '11:22:33:44:55:66',
    uptime: '00:01:00',
    bytes_in: 1,
    bytes_out: 2,
    package_name: null,
  });
});
