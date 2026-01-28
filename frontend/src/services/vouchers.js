import { api } from './api';

// GET /api/vouchers (filters only)
export function listVouchers({ status, package_id, batch_id } = {}) {
  return api.get('/api/vouchers', {
    params: {
      status,
      package_id,
      batch_id,
    },
  });
}

// Backward-friendly alias (some pages may prefer this name)
export const getVouchers = listVouchers;

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

// POST /api/vouchers/redeem { code }
export async function redeemVoucher({ code }) {
  const response = await api.post('/api/vouchers/redeem', { code });
  return response.data;
}
