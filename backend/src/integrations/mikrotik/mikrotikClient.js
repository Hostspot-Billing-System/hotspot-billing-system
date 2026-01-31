import { RouterOSAPI } from 'node-routeros';
import { env } from '../../config/env.js';

const SUPPORTED_BASE_PATHS = ['/ip/hotspot/user', '/ip/hotspot/active', '/ip/hotspot/profile', '/system/resource'];

export class MikroTikClientError extends Error {
  constructor(code, message, { httpStatus = 500, cause } = {}) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.cause = cause;
  }
}

function requireMikroTikConfig({ host, user, password, port }) {
  if (!host || !user || !password) {
    throw new MikroTikClientError(
      'MIKROTIK_NOT_CONFIGURED',
      'MikroTik credentials are not configured on the backend',
      { httpStatus: 500 }
    );
  }

  const p = Number(port);
  if (!Number.isFinite(p) || p <= 0) {
    throw new MikroTikClientError('MIKROTIK_NOT_CONFIGURED', 'MikroTik port is not configured', { httpStatus: 500 });
  }
}

function normalizeCommand(command) {
  const raw = String(command ?? '').trim();
  if (!raw) {
    throw new MikroTikClientError('MIKROTIK_BAD_INPUT', 'command is required', { httpStatus: 400 });
  }

  if (!raw.startsWith('/')) {
    throw new MikroTikClientError('MIKROTIK_BAD_INPUT', 'command must start with /', { httpStatus: 400 });
  }

  // Allow using base path as shorthand for /print
  if (SUPPORTED_BASE_PATHS.includes(raw)) return `${raw}/print`;

  const supported = SUPPORTED_BASE_PATHS.some((base) => raw === base || raw.startsWith(`${base}/`));
  if (!supported) {
    throw new MikroTikClientError(
      'MIKROTIK_UNSUPPORTED_COMMAND',
      `Unsupported command. Allowed base paths: ${SUPPORTED_BASE_PATHS.join(', ')}`,
      { httpStatus: 400 }
    );
  }

  return raw;
}

function paramsToApiWords(params) {
  if (params == null) return [];

  if (Array.isArray(params)) {
    return params.map((p) => String(p));
  }

  if (typeof params !== 'object') {
    throw new MikroTikClientError('MIKROTIK_BAD_INPUT', 'params must be an object or array', { httpStatus: 400 });
  }

  const words = [];
  for (const [keyRaw, value] of Object.entries(params)) {
    const key = String(keyRaw);
    if (value === undefined) continue;

    // If caller already provided RouterOS API prefixes, keep them.
    // Examples: '?.id', '=.id', '?name', '=.proplist'
    if (key.startsWith('=') || key.startsWith('?')) {
      words.push(`${key}=${String(value)}`);
      continue;
    }

    words.push(`=${key}=${String(value)}`);
  }

  return words;
}

function classifyError(err, { stage }) {
  const errno = err?.errno;
  const message = String(err?.message ?? err ?? '');

  // node-routeros uses RosException with errno codes
  if (errno === 'SOCKTMOUT') {
    return new MikroTikClientError(
      'MIKROTIK_TIMEOUT',
      stage === 'connect' ? 'Connection to MikroTik timed out' : 'MikroTik command timed out',
      { httpStatus: 504, cause: err }
    );
  }

  if (errno === 'CANTLOGIN') {
    return new MikroTikClientError('MIKROTIK_AUTH_FAILED', 'MikroTik authentication failed', {
      httpStatus: 502,
      cause: err,
    });
  }

  // Common connectivity failures
  if (/ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|socket hang up/i.test(message)) {
    return new MikroTikClientError('MIKROTIK_UNREACHABLE', 'MikroTik is unreachable', { httpStatus: 503, cause: err });
  }

  if (stage === 'connect') {
    return new MikroTikClientError('MIKROTIK_CONNECT_FAILED', 'Failed to connect to MikroTik', {
      httpStatus: 502,
      cause: err,
    });
  }

  return new MikroTikClientError('MIKROTIK_COMMAND_FAILED', 'MikroTik command failed', { httpStatus: 502, cause: err });
}

export class MikroTikClient {
  constructor({ host, user, password, port, timeoutSeconds } = {}) {
    this.host = host ?? env.MT_HOST;
    this.user = user ?? env.MT_USER;
    this.password = password ?? env.MT_PASS;
    this.port = port ?? env.MT_PORT;

    // node-routeros timeout is in seconds
    const fromMs = Number(env.MT_TIMEOUT_MS ?? 0);
    const fallbackSeconds = 10;
    const derivedSeconds = Number.isFinite(fromMs) && fromMs > 0 ? Math.ceil(fromMs / 1000) : null;
    this.timeoutSeconds =
      timeoutSeconds ?? (derivedSeconds != null ? derivedSeconds : fallbackSeconds);

    this._conn = null;
    this._connected = false;
  }

  async connect() {
    requireMikroTikConfig({ host: this.host, user: this.user, password: this.password, port: this.port });

    if (this._connected && this._conn) return;

    this._conn = new RouterOSAPI({
      host: this.host,
      user: this.user,
      password: this.password,
      port: this.port,
      timeout: this.timeoutSeconds,
      keepalive: false,
    });

    try {
      await this._conn.connect();
      this._connected = true;
    } catch (err) {
      this._connected = false;
      throw classifyError(err, { stage: 'connect' });
    }
  }

  async close() {
    if (!this._conn) {
      this._connected = false;
      return;
    }

    try {
      await this._conn.close();
    } catch {
      // ignore close errors
    } finally {
      this._connected = false;
      this._conn = null;
    }
  }

  async exec(command, params) {
    const cmd = normalizeCommand(command);

    if (!this._conn || !this._connected) {
      throw new MikroTikClientError('MIKROTIK_NOT_CONNECTED', 'MikroTik client is not connected', { httpStatus: 500 });
    }

    const words = paramsToApiWords(params);

    try {
      // node-routeros write signature: write('/path', ['=k=v', '?.id=*1'])
      return await this._conn.write(cmd, words);
    } catch (err) {
      throw classifyError(err, { stage: 'exec' });
    }
  }
}
