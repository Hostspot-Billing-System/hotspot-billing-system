import { getMikroTikActiveSessions } from '../services/mikrotikSessionsService.js';
import { toHttpError as toMikroTikRuntimeHttpError } from '../services/mikrotikRuntime/errors.js';

export async function listMikroTikSessionsHandler(req, res) {
  try {
    const sessions = await getMikroTikActiveSessions();
    return res.status(200).json({ success: true, data: sessions });
  } catch (err) {
    const runtimeHttp = toMikroTikRuntimeHttpError(err);
    if (runtimeHttp) return res.status(runtimeHttp.httpStatus).json(runtimeHttp.body);

    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  }
}
