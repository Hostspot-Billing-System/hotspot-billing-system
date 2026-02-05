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

// DELETE /api/vouchers/:id
export async function deleteVoucherById(id) {
  const response = await api.delete(`/api/vouchers/${id}`);
  return response.data;
}

// POST /api/vouchers/bulk-delete { ids: number[] }
// Backward-compatible: older backend route is /api/vouchers/delete-bulk
export async function bulkDeleteVouchersByIds(ids) {
  try {
    const response = await api.post('/api/vouchers/bulk-delete', { ids });
    return response.data;
  } catch (err) {
    const status = err?.response?.status;
    const code = err?.response?.data?.error?.code;
    // Fallback for older deployments that only have /delete-bulk.
    if (status === 404 || code === 'NOT_FOUND') {
      const response = await api.post('/api/vouchers/delete-bulk', { ids });
      return response.data;
    }
    throw err;
  }
}

// POST /api/vouchers/:id/direct-sale
export async function sellVoucherDirectlyById(id, { phone_number, customer_name, notes } = {}) {
  const response = await api.post(`/api/vouchers/${id}/direct-sale`, {
    phone_number,
    customer_name,
    notes,
  });
  return response.data;
}
