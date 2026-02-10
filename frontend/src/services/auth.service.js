import { apiFetch } from '../utils/requests';

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

export async function resetPassword(token, password) {
  return apiFetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
    credentials: 'include',
  });
}
