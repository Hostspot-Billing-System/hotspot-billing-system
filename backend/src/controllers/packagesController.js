import { query } from '../config/db.js';

export async function listPackages(req, res) {
  try {
    const result = await query(
      `
      SELECT id, name, duration_minutes, mikrotik_profile, created_at
      FROM packages
      ORDER BY created_at DESC
      `
    );

    return res.status(200).json({ success: true, packages: result.rows });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}
