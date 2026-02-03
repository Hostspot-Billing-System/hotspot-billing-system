import { api } from './api';

export async function getMyProfile() {
  const res = await api.get('/api/my-profile');
  return res?.data;
}

export async function updateMyProfile(payload) {
  const res = await api.put('/api/my-profile', payload);
  return res?.data;
}

export async function changeMyPassword(payload) {
  const res = await api.post('/api/my-profile/change-password', payload);
  return res?.data;
}
