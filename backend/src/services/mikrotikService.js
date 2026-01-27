import * as routeros from 'routeros-client';
import { env } from '../config/env.js';

const { RouterOSClient } = routeros;

class MikroTikError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function requireMikroTikEnv() {
  if (!env.MT_HOST || !env.MT_USER || !env.MT_PASS) {
    throw new MikroTikError(
      'MIKROTIK_NOT_CONFIGURED',
      'MikroTik credentials are not configured on the backend',
      500
    );
  }
}

export class MikroTikService {
  static async createHotspotUser({ username, password, profile }) {
    requireMikroTikEnv();

    if (!username || !password || !profile) {
      throw new MikroTikError('MIKROTIK_BAD_INPUT', 'Invalid hotspot user parameters', 500);
    }

    const api = new RouterOSClient({
      host: env.MT_HOST,
      user: env.MT_USER,
      password: env.MT_PASS,
      port: env.MT_PORT,
      timeout: env.MT_TIMEOUT_MS,
    });

    try {
      const client = await api.connect();

      // RouterOS path for hotspot users
      const menu = client.menu('/ip hotspot user');

      // Create or fail: if user already exists, RouterOS will error.
      await menu.add({
        name: username,
        password,
        profile,
      });

      return { created: true };
    } catch (err) {
      // Connection errors + API errors both land here.
      // We expose a clean message while keeping server logs useful.
      const message =
        err?.message && typeof err.message === 'string'
          ? err.message
          : 'Failed to create hotspot user on MikroTik';

      // Treat connectivity failures as 503.
      const connectivity = /connect|timeout|econn|socket|unreach/i.test(message);
      throw new MikroTikError(
        connectivity ? 'MIKROTIK_UNREACHABLE' : 'MIKROTIK_USER_CREATE_FAILED',
        connectivity
          ? 'MikroTik is unreachable. Please try again shortly.'
          : 'Failed to create hotspot user on MikroTik.',
        connectivity ? 503 : 502
      );
    } finally {
      try {
        await api.close();
      } catch {
        // ignore close errors
      }
    }
  }
}

export function toHttpError(err) {
  if (err instanceof MikroTikError) {
    return {
      httpStatus: err.httpStatus,
      body: {
        success: false,
        error: { code: err.code, message: err.message },
      },
    };
  }

  return null;
}
