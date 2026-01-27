import { api } from './api';

export async function uploadVouchersCsv({ packageId, file }) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('package_id', String(packageId));

  const response = await api.post('/api/vouchers/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  // Expected backend shape: { success: true, inserted, batch_id }
  return response.data;
}
