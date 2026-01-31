import test from 'node:test';
import assert from 'node:assert/strict';

import { pool } from '../src/config/db.js';
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

  await assert.rejects(
    () => resolveHotspotProfileForBundle(999999, { mikrotikClientFactory: fakeClientFactory }),
    (err) => {
      assert.ok(err instanceof MikroTikProfilesServiceError);
      assert.equal(err.code, 'BUNDLE_NOT_FOUND');
      return true;
    }
  );
});

test('mikrotikProfilesService: validates profile exists on router (mocked)', async () => {
  const now = Date.now();
  const pkgName = `SMOKE-MT-PROFILE-${now}`;

  const inserted = await pool.query(
    `
    INSERT INTO packages (name, duration_minutes, mikrotik_profile)
    VALUES ($1, 60, $2)
    RETURNING id
    `,
    [pkgName, `legacy-${now}`]
  );

  const bundleId = Number(inserted.rows?.[0]?.id);
  assert.ok(bundleId > 0);

  const profileName = `hotspot_${bundleId}`;

  try {
    const fakeClientFactory = () => ({
      connect: async () => {},
      close: async () => {},
      exec: async (command, params) => {
        assert.equal(command, '/ip/hotspot/profile/print');
        assert.equal(params?.['?name'], profileName);
        return [{ name: profileName }];
      },
    });

    const result = await resolveHotspotProfileForBundle(bundleId, { mikrotikClientFactory: fakeClientFactory });
    assert.equal(result.bundle.id, bundleId);
    assert.equal(result.profile_name, profileName);
  } finally {
    await pool.query('DELETE FROM packages WHERE id = $1', [bundleId]);
  }
});

test('mikrotikProfilesService: throws if profile missing on router (mocked)', async () => {
  const now = Date.now();
  const pkgName = `SMOKE-MT-PROFILE-MISS-${now}`;

  const inserted = await pool.query(
    `
    INSERT INTO packages (name, duration_minutes, mikrotik_profile)
    VALUES ($1, 60, $2)
    RETURNING id
    `,
    [pkgName, `legacy-${now}`]
  );

  const bundleId = Number(inserted.rows?.[0]?.id);
  assert.ok(bundleId > 0);

  try {
    const fakeClientFactory = () => ({
      connect: async () => {},
      close: async () => {},
      exec: async () => [],
    });

    await assert.rejects(
      () => resolveHotspotProfileForBundle(bundleId, { mikrotikClientFactory: fakeClientFactory }),
      (err) => {
        assert.ok(err instanceof MikroTikProfilesServiceError);
        assert.equal(err.code, 'MIKROTIK_PROFILE_NOT_FOUND');
        return true;
      }
    );
  } finally {
    await pool.query('DELETE FROM packages WHERE id = $1', [bundleId]);
  }
});
