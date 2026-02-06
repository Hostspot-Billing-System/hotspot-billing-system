import { loginStep1, logout, me, verifyOtp } from './auth.service.js';

export async function postLogin(req, res) {
  try {
    const result = await loginStep1(req.body ?? {}, { session: req.session, req });
    if (!result.success) {
      return res.status(result.status ?? 400).json({ success: false, error: result.error });
    }
    return res.json({
      success: true,
      requiresOtp: result.requiresOtp,
      requires_verification: result.requires_verification,
    });
  } catch (err) {
    const msg = err?.message ?? 'Failed to send verification code';
    return res.status(500).json({ success: false, error: msg });
  }
}

export async function postResendOtp(req, res) {
  // Same as login step 1: validate credentials, invalidate old OTP, send a new OTP.
  return postLogin(req, res);
}

export async function postVerify(req, res) {
  const body = req.body ?? {};
  // New contract: { email, otp }
  // Backward compatibility: { username, verification_code }
  const email = body.email;
  const otp = body.otp ?? body.verification_code;
  const result = await verifyOtp({ email, otp }, { session: req.session, req });
  if (!result.success) {
    return res.status(result.status ?? 400).json({ success: false, error: result.error });
  }

  return res.json({ success: true, message: result.message });
}

export function getMe(req, res) {
  const result = me({ session: req.session, req });
  return res.json(result);
}

export async function postLogout(req, res) {
  await logout({ session: req.session });
  res.clearCookie('omega.sid');
  return res.json({ success: true });
}
