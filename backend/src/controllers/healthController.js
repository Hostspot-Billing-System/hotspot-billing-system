import { checkDbConnection, query } from '../config/db.js';

export async function getHealth(req, res) {
  try {
    await checkDbConnection();

    const wantDetailsRaw = String(req.query?.details ?? '').trim().toLowerCase();
    const wantDetails = wantDetailsRaw === '1' || wantDetailsRaw === 'true' || wantDetailsRaw === 'yes';
    const allowDetails = process.env.NODE_ENV !== 'production' || process.env.HEALTH_DETAILS === 'true';

    if (wantDetails && allowDetails) {
      const info = await query(
        `
        SELECT
          current_database() AS db,
          current_user AS db_user,
          inet_server_addr()::text AS server_addr,
          inet_server_port()::int AS server_port
        `
      );

      return res.status(200).json({ status: 'ok', db: true, details: info.rows?.[0] ?? null });
    }

    return res.status(200).json({ status: 'ok', db: true });
  } catch (err) {
    return res.status(503).json({ status: 'degraded', db: false });
  }
}
