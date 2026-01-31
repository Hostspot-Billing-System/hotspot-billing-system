import { MikroTikClient, MikroTikClientError } from '../integrations/mikrotik/mikrotikClient.js';
import { env } from '../config/env.js';
import { getMikroTikMockState } from './mikrotikMockState.js';

export class MikroTikProvisioningError extends Error {
  constructor(code, message, { httpStatus = 502, cause } = {}) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.cause = cause;
  }
}

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

  _ensureDefaultProfiles(profileName) {
    // Default behavior: treat hotspot_* profiles as present to support local dev.
    if (profileName && String(profileName).startsWith('hotspot_')) {
      this._state.profiles.add(String(profileName));
    }
  }

  async exec(command, params = {}) {
    const cmd = String(command);

    if (cmd === '/ip/hotspot/profile/print') {
      const name = params['?name'] ?? null;
      this._ensureDefaultProfiles(name);
      if (!name) return Array.from(this._state.profiles).map((p) => ({ name: p }));
      return this._state.profiles.has(String(name)) ? [{ name: String(name) }] : [];
    }

    if (cmd === '/ip/hotspot/user/add') {
      const name = String(params.name ?? '').trim();
      if (!name) throw new MikroTikClientError('MIKROTIK_BAD_INPUT', 'name is required', 400);
      if (this._state.usersByName.has(name)) throw new Error('already exists');

      const user = {
        id: `*U${this._state.nextId++}`,
        username: name,
        password: String(params.password ?? ''),
        profile: params.profile ?? null,
        disabled: String(params.disabled ?? 'no').toLowerCase() === 'yes',
        limit_uptime: params['limit-uptime'] ?? null,
        uptime: null,
        comment: null,
      };
      this._state.usersByName.set(name, user);
      return [{ ret: user.id }];
    }

    if (cmd === '/ip/hotspot/user/print') {
      const name = params['?name'] ?? null;
      const toRow = (u) => ({
        '.id': u.id,
        name: u.username,
        password: u.password,
        profile: u.profile ?? null,
        'limit-uptime': u.limit_uptime ?? null,
        disabled: u.disabled ? 'yes' : 'no',
      });

      if (!name) return Array.from(this._state.usersByName.values()).map(toRow);
      const u = this._state.usersByName.get(String(name));
      return u ? [toRow(u)] : [];
    }

    if (cmd === '/ip/hotspot/user/set') {
      const id = params['=.id'] ?? null;
      const match = Array.from(this._state.usersByName.values()).find((u) => u.id === id);
      if (!match) throw new Error('not found');

      if (params.password != null) match.password = String(params.password);
      if (params.profile != null) match.profile = params.profile;
      if (params['limit-uptime'] != null) match.limit_uptime = params['limit-uptime'];
      if (params.disabled != null) match.disabled = String(params.disabled).toLowerCase() === 'yes';
      return [];
    }

    if (cmd === '/ip/hotspot/active/print') {
      const user = params['?user'] ?? null;
      const list = user ? this._state.active.filter((a) => a.user === String(user)) : this._state.active;
      return list.map((a) => ({
        '.id': a.id,
        user: a.user,
        address: a.address ?? null,
        'mac-address': a.mac_address ?? null,
        uptime: a.uptime ?? null,
        'bytes-in': a.bytes_in ?? 0,
        'bytes-out': a.bytes_out ?? 0,
      }));
    }

    if (cmd === '/ip/hotspot/active/remove') {
      const id = params['=.id'] ?? null;
      this._state.active = this._state.active.filter((a) => a.id !== id);
      return [];
    }

    throw new MikroTikClientError('MIKROTIK_UNSUPPORTED_COMMAND', `Mock does not support command: ${cmd}`, 400);
  }
}

function toRouterOsLimitUptimeFromMinutes(durationMinutes) {
  const minutes = Number(durationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new MikroTikProvisioningError('BAD_REQUEST', 'duration_minutes must be a positive number', { httpStatus: 400 });
  }

  const totalSeconds = Math.floor(minutes * 60);
  const days = Math.floor(totalSeconds / 86400);
  const remainder = totalSeconds % 86400;
  const hours = Math.floor(remainder / 3600);
  const mins = Math.floor((remainder % 3600) / 60);
  const secs = remainder % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

async function ensureHotspotProfileExists(client, profileName) {
  const rows = await client.exec('/ip/hotspot/profile/print', { '?name': profileName });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new MikroTikProvisioningError(
      'MIKROTIK_PROFILE_NOT_FOUND',
      `MikroTik hotspot profile '${profileName}' does not exist`,
      { httpStatus: 500 }
    );
  }
}

async function upsertHotspotUser(client, { voucherCode, profileName, limitUptime }) {
  // Try add first.
  try {
    await client.exec('/ip/hotspot/user/add', {
      name: voucherCode,
      password: voucherCode,
      profile: profileName,
      'limit-uptime': limitUptime,
      disabled: 'no',
    });
    return { action: 'created' };
  } catch (err) {
    // If user exists, fall back to set.
    const existing = await client.exec('/ip/hotspot/user/print', { '?name': voucherCode });
    const row = Array.isArray(existing) ? existing[0] : null;
    const id = row?.['.id'] ?? null;

    if (!id) {
      throw err;
    }

    await client.exec('/ip/hotspot/user/set', {
      '=.id': id,
      password: voucherCode,
      profile: profileName,
      'limit-uptime': limitUptime,
      disabled: 'no',
    });

    return { action: 'updated' };
  }
}

async function disconnectActiveSessions(client, voucherCode) {
  const actives = await client.exec('/ip/hotspot/active/print', { '?user': voucherCode });
  const rows = Array.isArray(actives) ? actives : [];

  for (const row of rows) {
    const id = row?.['.id'];
    if (!id) continue;
    await client.exec('/ip/hotspot/active/remove', { '=.id': id });
  }

  return { removed: rows.length };
}

/**
 * Provision a voucher on MikroTik Hotspot.
 *
 * Rules:
 * - Create or update hotspot user: name/password=voucher code
 * - Validate profile exists
 * - Set time-limit (limit-uptime) based on bundle duration
 * - Enable user immediately (disabled=no)
 * - Disconnect active session(s) if already logged in
 */
export async function provisionVoucherOnMikroTik({ voucherCode, bundleId, durationMinutes, profileName } = {}, { mikrotikClient } = {}) {
  const code = String(voucherCode ?? '').trim();
  if (!code) {
    throw new MikroTikProvisioningError('BAD_REQUEST', 'voucherCode is required', { httpStatus: 400 });
  }

  const resolvedProfileName = String(profileName ?? `hotspot_${bundleId}`).trim();
  if (!resolvedProfileName) {
    throw new MikroTikProvisioningError('BAD_REQUEST', 'profileName could not be resolved', { httpStatus: 400 });
  }

  const limitUptime = toRouterOsLimitUptimeFromMinutes(durationMinutes);

  const mode = String(env.MT_MODE ?? 'real').toLowerCase();
  const useMock = env.MIKROTIK_MOCK || mode === 'mock';
  const client = mikrotikClient ?? (useMock ? new MikroTikMockExecClient() : new MikroTikClient());

  // All router actions are wrapped in try/catch as required.
  try {
    await client.connect();

    await ensureHotspotProfileExists(client, resolvedProfileName);
    const upsert = await upsertHotspotUser(client, { voucherCode: code, profileName: resolvedProfileName, limitUptime });
    const disconnected = await disconnectActiveSessions(client, code);

    return {
      profile_name: resolvedProfileName,
      limit_uptime: limitUptime,
      user_action: upsert.action,
      active_sessions_removed: disconnected.removed,
    };
  } catch (err) {
    if (err instanceof MikroTikProvisioningError) throw err;
    if (err instanceof MikroTikClientError) throw err;

    throw new MikroTikProvisioningError('MIKROTIK_PROVISION_FAILED', 'Failed to provision voucher on MikroTik', {
      httpStatus: 502,
      cause: err,
    });
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }
}
