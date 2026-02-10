import { apiFetch } from '../utils/requests';

export async function getSmsSettings() {
  return apiFetch('/api/sms-settings');
}

export async function updateSmsSettings(payload) {
  return apiFetch('/api/sms-settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}
