import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getMe, postLogin, postLogout, postResendOtp, postVerify } from './auth.controller.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, postLogin);
router.post('/resend-otp', loginLimiter, postResendOtp);
router.post('/verify', verifyLimiter, postVerify);
router.post('/verify-otp', verifyLimiter, postVerify);
router.get('/me', getMe);
router.post('/logout', postLogout);

export default router;
