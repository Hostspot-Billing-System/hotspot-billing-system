import cron from 'node-cron';

import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { MikroTikClient, MikroTikClientError } from '../integrations/mikrotik/mikrotikClient.js';
import { getMikroTikMockState } from './mikrotikMockState.js';

class MikroTikMockExecClient {
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

    if (cmd === '/ip/hotspot/user/print') {
      const name = params['?name'] ?? null;
      const toRow = (u) => ({ '.id': u.id, name: u.username, disabled: u.disabled ? 'yes' : 'no' });
      if (!name) return Array.from(this._state.usersByName.values()).map(toRow);
      const u = this._state.usersByName.get(String(name));
      return u ? [toRow(u)] : [];
    }

    if (cmd === '/ip/hotspot/user/set') {
      const id = params['=.id'] ?? null;
      const match = Array.from(this._state.usersByName.values()).find((u) => u.id === id);
      if (!match) return [];
      if (params.disabled != null) match.disabled = String(params.disabled).toLowerCase() === 'yes';
      return [];
    }

    if (cmd === '/ip/hotspot/active/print') {
      const user = params['?user'] ?? null;
      const list = user ? this._state.active.filter((a) => a.user === String(user)) : this._state.active;
      return list.map((a) => ({ '.id': a.id, user: a.user }));
    }

    if (cmd === '/ip/hotspot/active/remove') {
      const id = params['=.id'] ?? null;
      this._state.active = this._state.active.filter((a) => a.id !== id);
      return [];
    }

    throw new MikroTikClientError('MIKROTIK_UNSUPPORTED_COMMAND', `Mock does not support command: ${cmd}`, {
      httpStatus: 400,
    });
  }

  // Optional helpers for local/dev testing
  __seedUser({ username, disabled = 'no' } = {}) {
    const name = String(username ?? '').trim();
    if (!name) return;
    this._usersByName.set(name, { '.id': `*U${this._nextId++}`, name, disabled });
  }

  __seedActive({ user } = {}) {
    const u = String(user ?? '').trim();
    if (!u) return;
    this._active.push({ '.id': `*A${this._nextId++}`, user: u });
  }
}

function createExecClient() {
  if (env.MIKROTIK_MOCK) return new MikroTikMockExecClient();

  const mode = String(env.MT_MODE ?? 'real').toLowerCase();
  return mode === 'mock' ? new MikroTikMockExecClient() : new MikroTikClient();
}

function isMikroTikConfigured() {
  if (env.MIKROTIK_MOCK) return true;

  const mode = String(env.MT_MODE ?? 'real').toLowerCase();
  if (mode === 'mock') return true;
  return Boolean(env.MT_HOST && env.MT_USER && env.MT_PASS);
}

async function disableHotspotUserIfExists(client, username) {
  const rows = await client.exec('/ip/hotspot/user/print', { '?name': username });
  const row = Array.isArray(rows) ? rows[0] : null;
  const id = row?.['.id'] ?? null;
  if (!id) return { existed: false, disabled: false };

  await client.exec('/ip/hotspot/user/set', { '=.id': id, disabled: 'yes' });
  return { existed: true, disabled: true };
}

async function removeActiveSessions(client, username) {
  const actives = await client.exec('/ip/hotspot/active/print', { '?user': username });
  const rows = Array.isArray(actives) ? actives : [];

  let removed = 0;
  for (const row of rows) {
    const id = row?.['.id'];
    if (!id) continue;
    await client.exec('/ip/hotspot/active/remove', { '=.id': id });
    removed++;
  }

  return removed;
}

export async function enforceExpiredVouchersOnce({ pageSize = 250 } = {}) {
  const size = Number(pageSize);
  const limit = Number.isFinite(size) && size > 0 ? Math.floor(size) : 250;

  const client = createExecClient();

  let processed = 0;
  let mikrotikActions = 0;
  let lastId = 0;

  try {
    await client.connect();

    while (true) {
      const res = await query(
        `
        SELECT id::int AS id, code
        FROM vouchers
        WHERE status = 'expired'::voucher_status
          AND id > $1
        ORDER BY id ASC
        LIMIT $2
        `,
        [lastId, limit]
      );

      const rows = res.rows ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        lastId = row.id;
        const code = String(row.code ?? '').trim();
        if (!code) continue;

        processed++;
        try {
          const disabled = await disableHotspotUserIfExists(client, code);
          const removed = await removeActiveSessions(client, code);
          if (disabled.disabled || removed > 0) mikrotikActions++;
        } catch (err) {
          // Keep the job resilient: one bad voucher/router error shouldn't stop the scan.
          // Log a minimal message for operators.
          console.warn(`[mikrotikExpiry] Failed for voucher ${code}:`, err?.message ?? err);
        }
      }

      if (rows.length < limit) break;
    }

    return { processed, mikrotikActions };
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
}

let cronTask = null;
let cronRunning = false;
let notConfiguredLogged = false;

export function startMikroTikExpiryCron() {
  if (cronTask) return cronTask;

  cronTask = cron.schedule('*/5 * * * *', async () => {
    if (cronRunning) return;
    if (!isMikroTikConfigured()) {
      if (!notConfiguredLogged) {
        notConfiguredLogged = true;
        console.warn('[mikrotikExpiry] MikroTik not configured; expiry enforcement is idle.');
      }
      return;
    }
    cronRunning = true;

    try {
      const { processed, mikrotikActions } = await enforceExpiredVouchersOnce();
      if (processed > 0 || mikrotikActions > 0) {
        console.log(`[mikrotikExpiry] processed=${processed} mikrotikActions=${mikrotikActions}`);
      }
    } catch (err) {
      console.warn('[mikrotikExpiry] job failed:', err?.message ?? err);
    } finally {
      cronRunning = false;
    }
  });

  return cronTask;
}

export function stopMikroTikExpiryCron() {
  if (!cronTask) return;
  cronTask.stop();
  cronTask = null;
}
