import { env } from '../config/env.js';
import { MikroTikClient, MikroTikClientError } from '../integrations/mikrotik/mikrotikClient.js';
import { getMikroTikMockState } from './mikrotikMockState.js';

class MikroTikMockStatusClient {
  constructor() {
    this._state = getMikroTikMockState();
  }

  async connect() {
    return this;
  }

  async close() {
    return;
  }

  async exec(command, params = {}) {
    const cmd = String(command);

    if (cmd === '/system/resource/print') {
      return [this._state.systemResource];
    }

    if (cmd === '/ip/hotspot/active/print') {
      const user = params['?user'] ?? null;
      const list = user ? this._state.active.filter((a) => a.user === String(user)) : this._state.active;
      return list.map((a) => ({ user: a.user }));
    }

    throw new MikroTikClientError('MIKROTIK_UNSUPPORTED_COMMAND', `Mock does not support command: ${cmd}`, {
      httpStatus: 400,
    });
  }

  // Optional helpers
  __seedActive(row) {
    this._state.active.push(row);
  }

  __setResource(resource) {
    this._state.systemResource = { ...this._state.systemResource, ...(resource ?? {}) };
  }
}

function createClient() {
  if (env.MIKROTIK_MOCK) return new MikroTikMockStatusClient();

  const mode = String(env.MT_MODE ?? 'real').toLowerCase();
  return mode === 'mock' ? new MikroTikMockStatusClient() : new MikroTikClient();
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function getMikroTikStatus({ mikrotikClient } = {}) {
  const client = mikrotikClient ?? createClient();

  try {
    await client.connect();

    const resourceRows = await client.exec('/system/resource/print');
    const resource = Array.isArray(resourceRows) ? resourceRows[0] : null;

    const activeRows = await client.exec('/ip/hotspot/active/print');
    const active = Array.isArray(activeRows) ? activeRows : [];

    const activeUsers = new Set();
    for (const row of active) {
      const user = String(row?.user ?? '').trim();
      if (user) activeUsers.add(user);
    }

    return {
      connected: true,
      uptime: resource?.uptime ?? null,
      cpu_load: toInt(resource?.['cpu-load']),
      memory_free: toInt(resource?.['free-memory']),
      active_users: activeUsers.size,
    };
  } catch (err) {
    // Spec asks for fields only; return a stable shape even when disconnected.
    return {
      connected: false,
      uptime: null,
      cpu_load: null,
      memory_free: null,
      active_users: null,
    };
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
}
