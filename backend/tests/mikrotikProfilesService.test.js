import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MikroTikProfilesServiceError,
  getHotspotProfileNameForBundleId,
  resolveHotspotProfileForBundle,
} from '../src/services/mikrotikProfilesService.js';

test('mikrotikProfilesService: profile naming convention hotspot_{bundle_id}', () => {
  assert.equal(getHotspotProfileNameForBundleId(123), 'hotspot_123');
});

test('mikrotikProfilesService: throws BUNDLE_NOT_FOUND when bundle missing', async () => {
  const fakeClientFactory = () => ({
    connect: async () => {},
    close: async () => {},
    exec: async () => [{ name: 'hotspot_999999' }],
  });

  const fakeDbQuery = async () => ({ rows: [] });

  await assert.rejects(
    () =>
      resolveHotspotProfileForBundle(999999, {
        dbQuery: fakeDbQuery,
        mikrotikClientFactory: fakeClientFactory,
      }),
    (err) => {
      assert.ok(err instanceof MikroTikProfilesServiceError);
      assert.equal(err.code, 'BUNDLE_NOT_FOUND');
      return true;
    }
  );
});

test('mikrotikProfilesService: validates profile exists on router (mocked)', async () => {
  const bundleId = 12345;
  assert.ok(bundleId > 0);

  const profileName = `hotspot_${bundleId}`;

  const fakeDbQuery = async () => ({
    rows: [
      {
        id: bundleId,
        name: `SMOKE-MT-PROFILE-${Date.now()}`,
        duration_minutes: 60,
        mikrotik_profile: `legacy-${Date.now()}`,
      },
    ],
  });

  const fakeClientFactory = () => ({
    connect: async () => {},
    close: async () => {},
    exec: async (command, params) => {
      assert.equal(command, '/ip/hotspot/profile/print');
      assert.equal(params?.['?name'], profileName);
      return [{ name: profileName }];
    },
  });

  const result = await resolveHotspotProfileForBundle(bundleId, {
    dbQuery: fakeDbQuery,
    mikrotikClientFactory: fakeClientFactory,
  });
  assert.equal(result.bundle.id, bundleId);
  assert.equal(result.profile_name, profileName);
});

test('mikrotikProfilesService: throws if profile missing on router (mocked)', async () => {
  const bundleId = 54321;
  assert.ok(bundleId > 0);

  const fakeDbQuery = async () => ({
    rows: [
      {
        id: bundleId,
        name: `SMOKE-MT-PROFILE-MISS-${Date.now()}`,
        duration_minutes: 60,
        mikrotik_profile: `legacy-${Date.now()}`,
      },
    ],
  });

  const fakeClientFactory = () => ({
    connect: async () => {},
    close: async () => {},
    exec: async () => [],
  });

  await assert.rejects(
    () =>
      resolveHotspotProfileForBundle(bundleId, {
        dbQuery: fakeDbQuery,
        mikrotikClientFactory: fakeClientFactory,
      }),
    (err) => {
      assert.ok(err instanceof MikroTikProfilesServiceError);
      assert.equal(err.code, 'MIKROTIK_PROFILE_NOT_FOUND');
      return true;
    }
  );
});
