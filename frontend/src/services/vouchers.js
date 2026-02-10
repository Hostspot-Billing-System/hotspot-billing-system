import { apiFetch } from '../utils/requests';


// GET /api/vouchers (filters only)
export async function listVouchers({ status, package_id, batch_id } = {}) {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  if (package_id) params.append('package_id', package_id);
  if (batch_id) params.append('batch_id', batch_id);
  return apiFetch(`/api/vouchers?${params.toString()}`);
}

// Backward-friendly alias (some pages may prefer this name)
export const getVouchers = listVouchers;

export async function uploadVouchersCsv({ packageId, file }) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('package_id', String(packageId));
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/vouchers/upload`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Upload failed');
  return data;
}

// POST /api/vouchers/redeem { code }
export async function redeemVoucher({ code }) {
  return apiFetch('/api/vouchers/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
    credentials: 'include',
  });
}

// DELETE /api/vouchers/:id
export async function deleteVoucherById(id) {
  return apiFetch(`/api/vouchers/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}

// POST /api/vouchers/bulk-delete { ids: number[] }
// Backward-compatible: older backend route is /api/vouchers/delete-bulk
export async function bulkDeleteVouchersByIds(ids) {
  try {
    return await apiFetch('/api/vouchers/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
      credentials: 'include',
    });
  } catch (err) {
    // Fallback for older deployments that only have /delete-bulk.
    if (err.message?.includes('404') || err.message?.includes('NOT_FOUND')) {
      return await apiFetch('/api/vouchers/delete-bulk', {
        method: 'POST',
        body: JSON.stringify({ ids }),
        credentials: 'include',
      });
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
