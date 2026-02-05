import { query } from '../config/db.js';
import { MikroTikClient } from '../integrations/mikrotik/mikrotikClient.js';
import { env } from '../config/env.js';

class MikroTikProfilesMockClient {
  async connect() {
    return this;
  }

  async close() {
    return;
  }

  async exec(command, params = {}) {
    const cmd = String(command);
    if (cmd !== '/ip/hotspot/profile/print') return [];

    const name = String(params['?name'] ?? '').trim();
    if (!name) return [];

    // In mock mode, treat hotspot_* profiles as present.
    if (name.startsWith('hotspot_')) return [{ name }];
    return [];
  }
}

export class MikroTikProfilesServiceError extends Error {
  constructor(code, message, { httpStatus = 500, cause } = {}) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.cause = cause;
  }
}

function parseBundleId(value) {
  const n = Number(String(value ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new MikroTikProfilesServiceError('BAD_REQUEST', 'bundle_id must be a valid positive number', {
      httpStatus: 400,
    });
  }
  return Math.floor(n);
}

export function getHotspotProfileNameForBundleId(bundleId) {
  const id = parseBundleId(bundleId);
  return `hotspot_${id}`;
}

async function fetchBundleById(bundleId, { dbQuery = query } = {}) {
  const id = parseBundleId(bundleId);

  const res = await dbQuery(
    `
    SELECT id, name, duration_minutes, mikrotik_profile
    FROM packages
    WHERE id = $1
    `,
    [id]
  );

  const row = res.rows?.[0] ?? null;
  if (!row) {
    throw new MikroTikProfilesServiceError('BUNDLE_NOT_FOUND', 'Bundle not found', { httpStatus: 404 });
  }

  return {
    id: Number(row.id),
    name: row.name,
    duration_minutes: Number(row.duration_minutes),
    // Keep this for compatibility even though Phase F naming convention is hotspot_{bundle_id}
    mikrotik_profile: row.mikrotik_profile,
  };
}

async function validateHotspotProfileExists(profileName, { mikrotikClient }) {
  const name = String(profileName ?? '').trim();
  if (!name) {
    throw new MikroTikProfilesServiceError('BAD_REQUEST', 'profileName is required', { httpStatus: 400 });
  }

  await mikrotikClient.connect();
  try {
    const rows = await mikrotikClient.exec('/ip/hotspot/profile/print', { '?name': name });
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new MikroTikProfilesServiceError(
        'MIKROTIK_PROFILE_NOT_FOUND',
        `MikroTik hotspot profile '${name}' does not exist`,
        { httpStatus: 500 }
      );
    }
  } finally {
    await mikrotikClient.close();
  }
}

/**
 * Resolves the MikroTik hotspot profile for a billing bundle.
 *
 * Phase F convention: hotspot_{bundle_id}
 *
 * - Fetches bundle from DB
 * - Resolves profile name
 * - Validates profile exists on router (read-only)
 */
export async function resolveHotspotProfileForBundle(bundleId, { dbQuery = query, mikrotikClientFactory } = {}) {
  const bundle = await fetchBundleById(bundleId, { dbQuery });
  const profileName = getHotspotProfileNameForBundleId(bundle.id);

  const mikrotikClient = mikrotikClientFactory
    ? mikrotikClientFactory()
    : env.MIKROTIK_MOCK
      ? new MikroTikProfilesMockClient()
      : new MikroTikClient();

  try {
    await validateHotspotProfileExists(profileName, { mikrotikClient });
  } catch (err) {
    if (err instanceof MikroTikProfilesServiceError) throw err;
    // Allow bubbling typed errors from MikroTik client
    if (err?.code && err?.httpStatus) throw err;

    throw new MikroTikProfilesServiceError('MIKROTIK_PROFILE_VALIDATE_FAILED', 'Failed to validate MikroTik profile', {
      httpStatus: 502,
      cause: err,
    });
  }

  return {
    bundle,
    profile_name: profileName,
  };
}
