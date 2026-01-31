import { getMikroTikStatus } from '../services/mikrotikStatusService.js';

export async function getMikroTikStatusHandler(req, res) {
  const status = await getMikroTikStatus();

  // JSON only
  return res.status(200).json(status);
}
