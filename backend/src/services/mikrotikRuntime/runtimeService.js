import { env } from '../../config/env.js';
import { MikroTikRuntimeError } from './errors.js';
import { MikroTikMockClient } from './mockClient.js';
import { MikroTikRealApi8728Client } from './realApiClient.js';

let singleton = null;

function createClient() {
  if (env.MIKROTIK_MOCK) return new MikroTikMockClient();

  const mode = String(env.MT_MODE ?? 'real').toLowerCase();
  if (mode === 'mock') return new MikroTikMockClient();
  if (mode === 'real') return new MikroTikRealApi8728Client();

  throw new MikroTikRuntimeError('MIKROTIK_BAD_CONFIG', `Unsupported MT_MODE: ${mode}`, 500);
}

export function getMikroTikRuntimeClient() {
  if (!singleton) singleton = createClient();
  return singleton;
}

function normalizeLimitUptime(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  // RouterOS accepts formats like: 1h, 30m, 1d, 00:30:00, etc. We'll pass through.
  return v;
}

export async function upsertHotspotUser(input) {
  const username = String(input?.username ?? '').trim();
  const password = input?.password == null ? null : String(input.password);
  const profile = input?.profile == null ? null : String(input.profile).trim();
  const limitUptime = normalizeLimitUptime(input?.limit_uptime);
  const disabled = input?.disabled;

  if (!username) throw new MikroTikRuntimeError('BAD_REQUEST', 'username is required', 400);

  const client = getMikroTikRuntimeClient();
  return client.upsertHotspotUser({ username, password, profile, limitUptime, disabled });
}

export async function setHotspotUserDisabled({ username, disabled }) {
  const name = String(username ?? '').trim();
  if (!name) throw new MikroTikRuntimeError('BAD_REQUEST', 'username is required', 400);

  const client = getMikroTikRuntimeClient();
  return client.setHotspotUserDisabled({ username: name, disabled: Boolean(disabled) });
}

export async function getHotspotUser(username) {
  const name = String(username ?? '').trim();
  if (!name) throw new MikroTikRuntimeError('BAD_REQUEST', 'username is required', 400);

  const client = getMikroTikRuntimeClient();
  return client.getHotspotUser(name);
}

export async function listHotspotActive({ user } = {}) {
  const client = getMikroTikRuntimeClient();
  return client.listHotspotActive({ username: user ? String(user) : undefined });
}

export async function removeHotspotActiveById({ id }) {
  const activeId = String(id ?? '').trim();
  if (!activeId) throw new MikroTikRuntimeError('BAD_REQUEST', 'id is required', 400);

  const client = getMikroTikRuntimeClient();
  return client.removeHotspotActiveById({ id: activeId });
}

export async function disconnectHotspotUser({ username }) {
  const name = String(username ?? '').trim();
  if (!name) throw new MikroTikRuntimeError('BAD_REQUEST', 'username is required', 400);

  const client = getMikroTikRuntimeClient();
  const sessions = await client.listHotspotActive({ username: name });

  let removed = 0;
  for (const s of sessions ?? []) {
    const id = s?.id;
    if (!id) continue;
    await client.removeHotspotActiveById({ id });
    removed++;
  }

  return { removed };
}

export async function closeMikroTikRuntimeClient() {
  if (!singleton) return;
  try {
    await singleton.close();
  } finally {
    singleton = null;
  }
}
