import { api } from './api';

export async function fetchPackages() {
  const response = await api.get('/packages');
  // Expected backend shape: { success: true, packages: [...] }
  return response.data;
}
