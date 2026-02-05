import { api } from './api';

export function getBundles(params) {
  return api.get('/api/bundles', { params });
}

export async function listBundles(params) {
  const res = await getBundles(params);
  const data = res?.data;
  if (data && typeof data === 'object' && data.success === true && Array.isArray(data.data)) {
    return data.data;
  }
  return [];
}

export function createBundle(payload) {
  return api.post('/api/bundles', payload);
}

export function updateBundle(id, payload) {
  return api.put(`/api/bundles/${id}`, payload);
}

export function patchBundleStatus(id, status) {
  return api.patch(`/api/bundles/${id}/status`, { status });
}

export function deleteBundle(id) {
  return api.delete(`/api/bundles/${id}`);
}
