import crypto from 'crypto';

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

export function computeDeviceFingerprint(req) {
  const ip = req.ip || req.connection?.remoteAddress || '';
  const userAgent = req.get?.('user-agent') || '';
  return sha256(`${ip}|${userAgent}`);
}

export default function requireAuth(req, res, next) {
  const session = req.session;
  if (!session?.user || session.user.role !== 'admin') {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // If user_id is present, enforce it (single-tenant owner account).
  if (session.user.user_id != null && Number(session.user.user_id) !== 1) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const expected = session.deviceFingerprint;
  const actual = computeDeviceFingerprint(req);

  if (!expected || expected !== actual) {
    try {
      req.session.destroy(() => {
        res.clearCookie('omega.sid');
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      });
    } catch {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    return;
  }

  return next();
}
