import { api } from './api';

export function listRouters() {
  return api.get('/api/routers');
}

export function createRouter(payload) {
  return api.post('/api/routers', payload);
}

export function testRouter(id) {
  return api.post(`/api/routers/${id}/test`);
}

export function deleteRouter(id) {
  return api.delete(`/api/routers/${id}`);
}
