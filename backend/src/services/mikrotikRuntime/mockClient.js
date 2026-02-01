import { MikroTikRuntimeError } from './errors.js';
import { getMikroTikMockState } from '../mikrotikMockState.js';

function normalizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    profile: user.profile ?? null,
    disabled: Boolean(user.disabled),
    limit_uptime: user.limit_uptime ?? null,
    uptime: user.uptime ?? null,
    comment: user.comment ?? null,
  };
}

function normalizeActive(session) {
  return {
    id: session.id,
    user: session.user,
    address: session.address ?? null,
    mac_address: session.mac_address ?? null,
    uptime: session.uptime ?? '0s',
    bytes_in: Number(session.bytes_in ?? 0),
    bytes_out: Number(session.bytes_out ?? 0),
    session_time_left: session.session_time_left ?? null,
    login_by: session.login_by ?? null,
  };
}

export class MikroTikMockClient {
  constructor() {
    this._state = getMikroTikMockState();
  }

  async connect() {
    return this;
  }

  async close() {
    return;
  }

  async getHotspotUser(username) {
    const name = String(username);
    const u = this._state.usersByName.get(name);
    if (!u) return null;

    return normalizeUser({
      id: u.id,
      username: u.username,
      profile: u.profile ?? null,
      disabled: Boolean(u.disabled),
      limit_uptime: u.limit_uptime ?? null,
      uptime: u.uptime ?? null,
      comment: u.comment ?? null,
    });
  }

  async upsertHotspotUser({ username, password, profile, limitUptime, disabled }) {
    const name = String(username ?? '').trim();
    if (!name) throw new MikroTikRuntimeError('MIKROTIK_BAD_INPUT', 'username is required', 400);

    const existing = this._state.usersByName.get(name) ?? null;
    if (!existing) {
      if (!password) {
        throw new MikroTikRuntimeError('MIKROTIK_BAD_INPUT', 'password is required when creating a new user', 400);
      }

      const user = {
        id: `*MOCK${this._state.nextId++}`,
        username: name,
        password: String(password),
        profile: profile ?? null,
        disabled: Boolean(disabled),
        limit_uptime: limitUptime ?? null,
        uptime: null,
        comment: null,
      };
      this._state.usersByName.set(name, user);
      return { action: 'created', user: normalizeUser(user) };
    }

    if (password) existing.password = String(password);
    if (profile) existing.profile = profile;
    if (limitUptime) existing.limit_uptime = limitUptime;
    if (disabled === true) existing.disabled = true;
    if (disabled === false) existing.disabled = false;

    return { action: 'updated', user: normalizeUser(existing) };
  }

  async setHotspotUserDisabled({ username, disabled }) {
    const name = String(username ?? '').trim();
    const existing = this._state.usersByName.get(name) ?? null;
    if (!existing) return { ok: false, reason: 'not_found' };

    existing.disabled = Boolean(disabled);
    return { ok: true, user: normalizeUser(existing) };
  }

  async listHotspotActive({ username } = {}) {
    const name = username ? String(username) : null;
    const list = name ? this._state.active.filter((s) => s.user === name) : this._state.active;
    return list.map(normalizeActive);
  }

  async listHotspotProfiles() {
    // Profiles are stored as names in a Set.
    return [...this._state.profiles].map((name) => ({ id: `*PROFILE_${name}`, name }));
  }

  async listHotspotUsers({ username } = {}) {
    const name = username ? String(username).trim() : null;
    if (name) {
      const u = await this.getHotspotUser(name);
      return u ? [u] : [];
    }

    const out = [];
    for (const u of this._state.usersByName.values()) {
      out.push(normalizeUser(u));
    }
    return out;
  }

  async removeHotspotUser({ username }) {
    const name = String(username ?? '').trim();
    if (!name) throw new MikroTikRuntimeError('MIKROTIK_BAD_INPUT', 'username is required', 400);
    const existed = this._state.usersByName.delete(name);

    // Also clear any active sessions.
    this._state.active = this._state.active.filter((s) => s.user !== name);

    return existed ? { ok: true } : { ok: false, reason: 'not_found' };
  }

  async getSystemIdentity() {
    return { name: 'mikrotik-mock' };
  }

  async removeHotspotActiveById({ id }) {
    const activeId = String(id ?? '').trim();
    if (!activeId) throw new MikroTikRuntimeError('MIKROTIK_BAD_INPUT', 'id is required', 400);
    const before = this._state.active.length;
    this._state.active = this._state.active.filter((s) => String(s.id) !== activeId);
    return { ok: before !== this._state.active.length };
  }

  // Test helper (not used by production code)
  __seedActiveSession(session) {
    const id = session?.id ?? `*ACTIVE${this._state.nextId++}`;
    this._state.active.push({ id, ...session });
  }
}
