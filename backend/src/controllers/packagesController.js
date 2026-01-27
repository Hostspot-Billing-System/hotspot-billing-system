import { query } from '../config/db.js';

const FALLBACK_PACKAGES = [
  { id: 1, name: '2 Hours Unlimited' },
  { id: 2, name: 'Daily Plan' },
];

export async function listPackages(req, res) {
  try {
    console.info('GET /api/packages');
    const result = await query(
      `
      SELECT id::int AS id, name
      FROM packages
      ORDER BY id ASC
      `
    );

    // Return a plain JSON array for simple clients.
    return res.status(200).json(result.rows);
  } catch (err) {
    // If the DB is down, keep the app usable for basic UI flows.
    if (err?.code === '28P01' || err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND') {
      return res.status(200).json(FALLBACK_PACKAGES);
    }

    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}

export async function listPackagesFull(req, res) {
  try {
    console.info('GET /api/packages/full');
    const result = await query(
      `
      SELECT id::int AS id, name, duration_minutes, mikrotik_profile, created_at
      FROM packages
      ORDER BY created_at DESC
      `
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    if (err?.code === '28P01' || err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND') {
      return res.status(200).json([
        { id: 1, name: '2 Hours Unlimited', duration_minutes: 120, mikrotik_profile: '2h-unlimited' },
        { id: 2, name: 'Daily Plan', duration_minutes: 1440, mikrotik_profile: 'daily-plan' },
      ]);
    }

    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}
