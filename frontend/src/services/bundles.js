import { apiFetch } from '../utils/requests';


// GET /api/bundles
export function getBundles(params) {
  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/bundles?${search}`);
}

export async function listBundles(params) {
  const data = await getBundles(params);
  if (data && typeof data === 'object' && data.success === true && Array.isArray(data.data)) {
    return data.data;
  }
  return [];
}

// POST /api/bundles
export function createBundle(payload) {
  return apiFetch('/api/bundles', {
    method: 'POST',
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}


// PUT /api/bundles/:id
export function updateBundle(id, payload) {
  return apiFetch(`/api/bundles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}


// PATCH /api/bundles/:id/status
export function updateBundleStatus(id, status) {
  return apiFetch(`/api/bundles/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
    credentials: 'include',
  });
}


// DELETE /api/bundles/:id
export function deleteBundle(id) {
  return apiFetch(`/api/bundles/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}
