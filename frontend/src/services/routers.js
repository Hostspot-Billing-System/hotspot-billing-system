import { apiFetch } from '../utils/requests';

export function listRouters() {
  return apiFetch('/api/routers');
}

export function createRouter(payload) {
  return apiFetch('/api/routers', {
    method: 'POST',
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}

export function testRouter(id) {
  return apiFetch(`/api/routers/${id}/test`, {
    method: 'POST',
    credentials: 'include',
  });
}

export function deleteRouter(id) {
  return apiFetch(`/api/routers/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}
