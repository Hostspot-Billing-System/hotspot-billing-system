import { api } from './api';

export function getClientsOverview(params) {
  return api.get('/api/clients/overview', { params });
}
