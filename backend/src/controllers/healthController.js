import { checkDbConnection } from '../config/db.js';

export async function getHealth(req, res) {
  try {
    await checkDbConnection();
    return res.status(200).json({ status: 'ok', db: true });
  } catch (err) {
    return res.status(503).json({ status: 'degraded', db: false });
  }
}
