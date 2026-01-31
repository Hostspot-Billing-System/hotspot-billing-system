import * as routeros from 'routeros-client';
import { env } from '../../config/env.js';
import { MikroTikRuntimeError } from './errors.js';

const { RouterOSClient } = routeros;

function requireMikroTikEnv() {
  if (!env.MT_HOST || !env.MT_USER || !env.MT_PASS) {
    throw new MikroTikRuntimeError(
      'MIKROTIK_NOT_CONFIGURED',
      'MikroTik credentials are not configured on the backend',
      500
    );
  }
}

function isConnectivityError(message) {
  return /connect|timeout|econn|socket|unreach|refused|timed out/i.test(String(message ?? ''));
}

function normalizeUserRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.name ?? null,
    profile: row.profile ?? null,
    disabled: String(row.disabled ?? '').toLowerCase() === 'true' || String(row.disabled ?? '') === 'yes',
    limit_uptime: row['limit-uptime'] ?? null,
    uptime: row.uptime ?? null,
    comment: row.comment ?? null,
  };
}

function normalizeActiveRecord(row) {
  if (!row) return null;
  const toInt = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  return {
    id: row.id,
    user: row.user ?? null,
    address: row.address ?? null,
    mac_address: row['mac-address'] ?? null,
    uptime: row.uptime ?? null,
    bytes_in: toInt(row['bytes-in']),
    bytes_out: toInt(row['bytes-out']),
    session_time_left: row['session-time-left'] ?? null,
    login_by: row['login-by'] ?? null,
  };
}

export class MikroTikRealApi8728Client {
  constructor() {
    requireMikroTikEnv();

    this.api = new RouterOSClient({
      host: env.MT_HOST,
      user: env.MT_USER,
      password: env.MT_PASS,
      port: env.MT_PORT,
      timeout: env.MT_TIMEOUT_MS,
    });

    this.client = null;
  }

  async connect() {
    if (this.client) return this.client;
    try {
      this.client = await this.api.connect();
      return this.client;
    } catch (err) {
      const message = err?.message ?? err;
      const connectivity = isConnectivityError(message);
      throw new MikroTikRuntimeError(
        connectivity ? 'MIKROTIK_UNREACHABLE' : 'MIKROTIK_CONNECT_FAILED',
        connectivity ? 'MikroTik is unreachable. Please try again shortly.' : 'Failed to connect to MikroTik.',
        connectivity ? 503 : 502
      );
    }
  }

  async close() {
    try {
      await this.api.close();
    } catch {
      // ignore
    } finally {
      this.client = null;
    }
  }

  async getHotspotUser(username) {
    const client = await this.connect();
    try {
      const menu = client.menu('/ip hotspot user');
      const row = await menu.where({ name: username }).getOnly();
      return normalizeUserRecord(row);
    } catch (err) {
      // getOnly throws if no matches
      return null;
    }
  }

  async upsertHotspotUser({ username, password, profile, limitUptime, disabled }) {
    const client = await this.connect();
    const menu = client.menu('/ip hotspot user');

    try {
      const existing = await menu.where({ name: username }).getOnly().catch(() => null);

      if (!existing) {
        if (!password) {
          throw new MikroTikRuntimeError('MIKROTIK_BAD_INPUT', 'password is required when creating a new user', 400);
        }

        const payload = {
          name: username,
          password,
        };
        if (profile) payload.profile = profile;
        if (limitUptime) payload['limit-uptime'] = limitUptime;
        if (disabled === true) payload.disabled = 'yes';

        const response = await menu.add(payload);
        const created = await menu.where('id', response?.ret).getOnly().catch(() => null);
        return { action: 'created', user: normalizeUserRecord(created) };
      }

      const model = client.model(existing);
      const updatePayload = {};

      if (password) updatePayload.password = password;
      if (profile) updatePayload.profile = profile;
      if (limitUptime) updatePayload['limit-uptime'] = limitUptime;
      if (disabled === true) updatePayload.disabled = 'yes';
      if (disabled === false) updatePayload.disabled = 'no';

      await model.update(updatePayload);
      const updated = await menu.where({ name: username }).getOnly().catch(() => null);
      return { action: 'updated', user: normalizeUserRecord(updated) };
    } catch (err) {
      if (err instanceof MikroTikRuntimeError) throw err;

      const message = err?.message ?? err;
      const connectivity = isConnectivityError(message);
      throw new MikroTikRuntimeError(
        connectivity ? 'MIKROTIK_UNREACHABLE' : 'MIKROTIK_COMMAND_FAILED',
        connectivity ? 'MikroTik is unreachable. Please try again shortly.' : 'MikroTik command failed.',
        connectivity ? 503 : 502
      );
    }
  }

  async setHotspotUserDisabled({ username, disabled }) {
    const client = await this.connect();
    const menu = client.menu('/ip hotspot user');

    const existing = await menu.where({ name: username }).getOnly().catch(() => null);
    if (!existing) return { ok: false, reason: 'not_found' };

    const model = client.model(existing);
    await model.update({ disabled: disabled ? 'yes' : 'no' });

    const updated = await menu.where({ name: username }).getOnly().catch(() => null);
    return { ok: true, user: normalizeUserRecord(updated) };
  }

  async listHotspotActive({ username } = {}) {
    const client = await this.connect();
    try {
      const menu = client.menu('/ip hotspot active');
      const query = username ? menu.where({ user: username }) : menu;
      const rows = await query.get();
      return (rows ?? []).map(normalizeActiveRecord).filter(Boolean);
    } catch (err) {
      const message = err?.message ?? err;
      const connectivity = isConnectivityError(message);
      throw new MikroTikRuntimeError(
        connectivity ? 'MIKROTIK_UNREACHABLE' : 'MIKROTIK_COMMAND_FAILED',
        connectivity ? 'MikroTik is unreachable. Please try again shortly.' : 'MikroTik command failed.',
        connectivity ? 503 : 502
      );
    }
  }

  async removeHotspotActiveById({ id }) {
    const client = await this.connect();
    try {
      const menu = client.menu('/ip hotspot active');
      // routeros-client supports removing by .id
      await menu.remove(String(id));
      return { ok: true };
    } catch (err) {
      const message = err?.message ?? err;
      const connectivity = isConnectivityError(message);
      throw new MikroTikRuntimeError(
        connectivity ? 'MIKROTIK_UNREACHABLE' : 'MIKROTIK_COMMAND_FAILED',
        connectivity ? 'MikroTik is unreachable. Please try again shortly.' : 'MikroTik command failed.',
        connectivity ? 503 : 502
      );
    }
  }
}
