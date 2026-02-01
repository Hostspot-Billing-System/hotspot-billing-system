// Simple "interface" for MikroTik clients.
// JS doesn't enforce interfaces at runtime, but this defines the required surface area.

export class MikroTikClient {
  async connect() {
    throw new Error('Not implemented');
  }

  async close() {
    throw new Error('Not implemented');
  }

  async listHotspotProfiles() {
    throw new Error('Not implemented');
  }

  async listHotspotUsers({ username } = {}) {
    void username;
    throw new Error('Not implemented');
  }

  async listHotspotActive({ username } = {}) {
    void username;
    throw new Error('Not implemented');
  }

  async upsertHotspotUser({ username, password, profile, limitUptime, disabled } = {}) {
    void username;
    void password;
    void profile;
    void limitUptime;
    void disabled;
    throw new Error('Not implemented');
  }

  async setHotspotUserDisabled({ username, disabled } = {}) {
    void username;
    void disabled;
    throw new Error('Not implemented');
  }

  async removeHotspotUser({ username } = {}) {
    void username;
    throw new Error('Not implemented');
  }

  async removeHotspotActiveById({ id } = {}) {
    void id;
    throw new Error('Not implemented');
  }

  async getSystemIdentity() {
    throw new Error('Not implemented');
  }
}
