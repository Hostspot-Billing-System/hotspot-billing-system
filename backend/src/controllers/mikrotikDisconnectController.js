import { disconnectHotspotUser } from '../services/mikrotikRuntime/runtimeService.js';
import { toHttpError } from '../services/mikrotikRuntime/errors.js';

function normalizeText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export async function disconnectMikroTikUserHandler(req, res) {
  try {
    const user = normalizeText(req.body?.user);
    if (!user) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'user is required' },
      });
    }

    const result = await disconnectHotspotUser({ username: user });

    // Return success even if user not active.
    return res.status(200).json({ success: true, removed: result.removed ?? 0 });
  } catch (err) {
    const { httpStatus, body } = toHttpError(err);
    return res.status(httpStatus).json(body);
  }
}
