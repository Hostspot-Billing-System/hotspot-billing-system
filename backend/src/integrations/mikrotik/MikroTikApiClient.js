import net from 'node:net';
import { RouterOSAPI } from 'node-routeros';

import { env } from '../../config/env.js';

export class MikroTikApiClient {
  constructor() {
    this.host = env.MT_HOST;
    this.port = Number(env.MT_PORT || 8728);
    this.username = env.MT_USER;
    this.password = env.MT_PASS;
    this.timeoutMs = Number(env.MT_TIMEOUT_MS || 5000);

    this.debug = String(process.env.MIKROTIK_DEBUG ?? '').toLowerCase() === 'true';
  }

  logDebug(message, meta) {
    if (!this.debug) return;
    const safeMeta = meta ? JSON.stringify(meta) : '';
    console.log(`[MIKROTIK_DEBUG] ${message}${safeMeta ? ` ${safeMeta}` : ''}`);
  }

  async tcpProbe() {
    const host = this.host;
    const port = this.port;
    const timeoutMs = Math.min(2000, Math.max(200, Number(this.timeoutMs) || 500));

    return await new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      const done = (result) => {
        if (settled) return;
        settled = true;
        try {
          socket.destroy();
        } catch {
          // ignore
        }
        resolve(result);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done({ ok: true }));
      socket.once('timeout', () => done({ ok: false, reason: 'timeout' }));
      socket.once('error', (err) => done({ ok: false, reason: 'error', code: err?.code ?? null }));

      try {
        socket.connect(port, host);
      } catch (err) {
        done({ ok: false, reason: 'exception', code: err?.code ?? null });
      }
    });
  }

  classifyError(err, { stage }) {
    const errno = err?.errno;
    const message = String(err?.message ?? err ?? '');

    if (errno === 'SOCKTMOUT') {
      const e = new Error(stage === 'connect' ? 'Connection to MikroTik timed out' : 'MikroTik command timed out');
      e.code = 'MIKROTIK_TIMEOUT';
      e.cause = err;
      return e;
    }

    if (errno === 'CANTLOGIN') {
      const e = new Error('MikroTik authentication failed');
      e.code = 'MIKROTIK_AUTH_FAILED';
      e.cause = err;
      return e;
    }

    if (/ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|socket hang up/i.test(message)) {
      const e = new Error('MikroTik is unreachable');
      e.code = 'MIKROTIK_UNREACHABLE';
      e.cause = err;
      return e;
    }

    const e = new Error(stage === 'connect' ? 'Failed to connect to MikroTik' : 'MikroTik command failed');
    e.code = stage === 'connect' ? 'MIKROTIK_CONNECT_FAILED' : 'MIKROTIK_COMMAND_FAILED';
    e.cause = err;
    return e;
  }

  async connect() {
    if (!this.host) {
      const err = new Error('MikroTik host is required');
      err.code = 'MIKROTIK_CONFIG';
      throw err;
    }
    if (!this.username || !this.password) {
      const err = new Error('MikroTik username and password are required');
      err.code = 'MIKROTIK_CONFIG';
      throw err;
    }

    this.logDebug('connect:start', {
      host: this.host,
      port: this.port,
      username: this.username,
      timeoutMs: this.timeoutMs,
    });

    if (this.debug) {
      const probe = await this.tcpProbe();
      this.logDebug('tcpProbe', probe);
    }

    const timeoutSeconds = Math.max(1, Math.ceil(this.timeoutMs / 1000));

    const api = new RouterOSAPI({
      host: this.host,
      user: this.username,
      password: this.password,
      port: this.port,
      timeout: timeoutSeconds,
      keepalive: false,
    });

    try {
      await Promise.race([
        api.connect(),
        new Promise((_, reject) =>
          setTimeout(() => {
            const e = new Error('Connection to MikroTik timed out');
            e.code = 'MIKROTIK_TIMEOUT';
            reject(e);
          }, this.timeoutMs)
        ),
      ]);
      this.logDebug('connect:ok');
      return api;
    } catch (err) {
      const classified = this.classifyError(err, { stage: 'connect' });
      this.logDebug('connect:failed', { code: classified.code, message: classified.message, errno: err?.errno ?? null });
      throw classified;
    }
  }

  async runCommand(path, params = {}) {
    const api = await this.connect();
    try {
      this.logDebug('command', { path });

		let payload = params;
		if (params && !Array.isArray(params) && typeof params === 'object') {
			const entries = Object.entries(params).filter(([, v]) => v !== undefined);
			const needsWords = entries.some(([k]) => String(k).startsWith('?') || String(k).startsWith('=') || String(k).startsWith('.'));
			if (needsWords) {
				payload = entries.map(([k, v]) => `${String(k)}=${String(v)}`);
			}
		}

		return await Promise.race([
			api.write(path, payload),
			new Promise((_, reject) =>
				setTimeout(() => {
					const e = new Error('MikroTik command timed out');
					e.code = 'MIKROTIK_TIMEOUT';
					reject(e);
				}, this.timeoutMs)
			),
		]);
    } catch (err) {
      const classified = this.classifyError(err, { stage: 'exec' });
      this.logDebug('command:failed', { path, code: classified.code, message: classified.message, errno: err?.errno ?? null });
      throw classified;
    } finally {
      try {
        await api.close();
      } catch {
        // ignore
      }
    }
  }

  // 🔹 Bundles (profiles)
  async getHotspotProfiles() {
    return this.runCommand('/ip/hotspot/user/profile/print');
  }

  // 🔹 Active users
  async getActiveSessions() {
    return this.runCommand('/ip/hotspot/active/print');
  }

  // 🔹 Create voucher (hotspot user)
  async createVoucher({ username, password, profile }) {
    // node-routeros uses plain keys
    return this.runCommand('/ip/hotspot/user/add', {
      name: username,
      password,
      profile,
    });
  }

  async removeHotspotUser(username) {
    const name = String(username ?? '').trim();
    if (!name) {
      const err = new Error('username is required');
      err.code = 'BAD_REQUEST';
      throw err;
    }

    const users = await this.runCommand('/ip/hotspot/user/print', { '?name': name });
    let removed = 0;
    for (const u of users ?? []) {
      const id = u?.['.id'];
      if (!id) continue;
      await this.runCommand('/ip/hotspot/user/remove', { '=.id': id });
      removed++;
    }
    return { removed };
  }

  // 🔹 Disconnect user
  async disconnectUser(username) {
    const active = await this.runCommand(
      '/ip/hotspot/active/print',
      { '?user': username }
    );

    if (active.length === 0) return false;

    await this.runCommand('/ip/hotspot/active/remove', {
      '=.id': active[0]['.id'],
    });

    return true;
  }

  // 🔹 Health check
  async healthCheck() {
    return this.runCommand('/system/identity/print');
  }
}
