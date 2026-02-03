import { query } from '../config/db.js';
import { encryptRouterPassword } from '../utils/encrypt.js';

function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function isValidHost(value) {
  const host = String(value ?? '').trim();
  if (!host) return false;
  // No protocol or path
  if (host.includes('://')) return false;
  if (host.includes('/')) return false;
  // Disallow explicit ports and IPv6 for now (host-only requirement)
  if (host.includes(':')) return false;
  // Basic safety: letters/numbers/dot/dash only
  return /^[a-zA-Z0-9.-]+$/.test(host);
}

function normalizeRouterRow(row) {
  return {
    id: Number(row.id),
    name: String(row.name),
    host: String(row.host),
    username: String(row.username),
    description: row.description == null ? '' : String(row.description),
    api_port: Number(row.api_port ?? 8728),
    winbox_port: Number(row.winbox_port ?? 8291),
    web_port: Number(row.web_port ?? 80),
    https_port: Number(row.https_port ?? 443),
    status: String(row.status ?? 'unknown'),
    last_checked: row.last_checked ? new Date(row.last_checked).toISOString() : null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

export async function listRouters(req, res) {
  const result = await query(
    `
    SELECT
      id,
      name,
      host,
      username,
      COALESCE(description, '') AS description,
      api_port,
      winbox_port,
      web_port,
      https_port,
      status,
      last_checked,
      created_at
    FROM mikrotik_routers
    ORDER BY created_at DESC, id DESC
    `
  );

  return res.status(200).json({
    success: true,
    data: {
      rows: (result.rows ?? []).map(normalizeRouterRow),
    },
  });
}

export async function createRouter(req, res) {
  const body = req.body ?? {};

  const name = String(body.name ?? '').trim();
  const host = String(body.host ?? '').trim();
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const description = String(body.description ?? '').trim();

  const api_port = toInt(body.api_port, 8728);
  const winbox_port = toInt(body.winbox_port, 8291);
  const web_port = toInt(body.web_port, 80);
  const https_port = toInt(body.https_port, 443);

  const errors = {};
  if (!hasValue(name)) errors.name = 'Router Name is required';
  if (!hasValue(host) || !isValidHost(host)) errors.host = 'Host/IP must be hostname or IP only (no protocol/port)';
  if (!hasValue(username)) errors.username = 'Username is required';
  if (!hasValue(password)) errors.password = 'Password is required';

  const portFields = [
    ['api_port', api_port],
    ['winbox_port', winbox_port],
    ['web_port', web_port],
    ['https_port', https_port],
  ];
  for (const [key, v] of portFields) {
    if (!Number.isFinite(v) || v <= 0 || v > 65535) {
      errors[key] = 'Port must be a number between 1 and 65535';
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', fields: errors } });
  }

  let password_encrypted;
  try {
    password_encrypted = encryptRouterPassword(password);
  } catch (e) {
    if (e?.code === 'MISSING_SECRET') {
      return res.status(500).json({
        success: false,
        error: {
          code: 'MISSING_SECRET',
          message: 'Server encryption secret not configured (set ROUTER_ENCRYPTION_SECRET)',
        },
      });
    }
    return res.status(500).json({ success: false, error: { code: 'ENCRYPTION_FAILED', message: 'Failed to encrypt password' } });
  }

  const insert = await query(
    `
    INSERT INTO mikrotik_routers (
      name,
      host,
      username,
      password_encrypted,
      description,
      api_port,
      winbox_port,
      web_port,
      https_port,
      status
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'unknown')
    RETURNING
      id,
      name,
      host,
      username,
      COALESCE(description, '') AS description,
      api_port,
      winbox_port,
      web_port,
      https_port,
      status,
      last_checked,
      created_at
    `,
    [name, host, username, password_encrypted, description, api_port, winbox_port, web_port, https_port]
  );

  return res.status(201).json({ success: true, data: normalizeRouterRow(insert.rows?.[0] ?? {}) });
}

export async function deleteRouter(req, res) {
  const id = Number(req.params?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid router id' } });
  }

  const del = await query('DELETE FROM mikrotik_routers WHERE id = $1 RETURNING id', [id]);
  if (!del.rows?.[0]) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Router not found' } });
  }

  return res.status(200).json({ success: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function testRouterConnection(req, res) {
  const id = Number(req.params?.id);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid router id' } });
  }

  const rowRes = await query(
    `
    SELECT id
    FROM mikrotik_routers
    WHERE id = $1
    `,
    [id]
  );

  if (!rowRes.rows?.[0]) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Router not found' } });
  }

  const isMock = String(process.env.MIKROTIK_MOCK ?? '').toLowerCase() === 'true';

  if (isMock) {
    const delay = 500 + Math.floor(Math.random() * 701);
    await sleep(delay);

    await query(
      `
      UPDATE mikrotik_routers
      SET status = 'online',
          last_checked = NOW()
      WHERE id = $1
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      data: {
        status: 'online',
        identity: 'mikrotik-mock',
        uptime: '3d 4h',
        version: '7.x (mock)',
      },
    });
  }

  // Real-mode placeholder: wire in API connection later.
  await query(
    `
    UPDATE mikrotik_routers
    SET status = 'unknown',
        last_checked = NOW()
    WHERE id = $1
    `,
    [id]
  );

  return res.status(501).json({
    success: false,
    error: {
      code: 'REAL_MODE_NOT_IMPLEMENTED',
      message: 'Real MikroTik API connection is not implemented yet',
    },
  });
}
