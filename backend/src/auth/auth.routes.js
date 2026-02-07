import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getMe,
  getResetPassword,
  postForgotPassword,
  postLogin,
  postLogout,
  postResendOtp,
  postResetPassword,
  postVerify,
} from './auth.controller.js';

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

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, postLogin);
router.post('/resend-otp', loginLimiter, postResendOtp);
router.post('/verify', verifyLimiter, postVerify);
router.post('/verify-otp', verifyLimiter, postVerify);
router.post('/forgot-password', forgotLimiter, postForgotPassword);
router.get('/reset-password', resetLimiter, getResetPassword);
router.post('/reset-password', resetLimiter, postResetPassword);
router.get('/me', getMe);
router.post('/logout', postLogout);

export default router;
