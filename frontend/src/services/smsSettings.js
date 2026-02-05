import { api } from './api';

export async function getSmsSettings() {
  const res = await api.get('/api/sms-settings');
  return res?.data;
}

export async function updateSmsSettings(payload) {
  const res = await api.put('/api/sms-settings', payload);
  return res?.data;
}
