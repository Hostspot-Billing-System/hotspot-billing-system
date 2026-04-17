import { apiFetch } from '../utils/requests';
import { api } from './api.js';

export async function getSession() {
  return apiFetch('/api/auth/me', {
    method: 'GET',
    credentials: 'include',
  });
}

export async function login(payload) {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}

export async function requestPasswordReset(email) {
  return apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    credentials: 'include',
  });
}

export async function verifyLoginOtp(payload) {
  const response = await api.post('/api/auth/verify-otp', payload);
  return response?.data ?? { success: false };
}

export async function resendLoginOtp(payload) {
  const response = await api.post('/api/auth/resend-otp', payload);
  return response?.data ?? { success: false };
}

export async function validateResetPasswordToken(token) {
  const response = await api.get('/api/auth/reset-password', {
    params: { token },
  });
  return {
    success: Boolean(response?.data?.success),
    valid: Boolean(response?.data?.valid),
  };
}

export async function resetPassword(token, password, confirmPassword = password) {
  return apiFetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      new_password: password,
      confirm_password: confirmPassword,
    }),
    credentials: 'include',
  });
}
