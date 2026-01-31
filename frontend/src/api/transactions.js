import { api } from '../services/api';

function buildDefaultFilename() {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `transactions_${dateStamp}.csv`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// GET /api/admin/transactions
// Supports filters: q, status, bundle_id, min_amount, max_amount, from_date, to_date, page, per_page

export async function fetchTransactions(params = {}) {
  const response = await api.get('/api/transactions', { params });
  return {
    data: Array.isArray(response.data?.data) ? response.data.data : [],
    meta: response.data?.meta ?? { page: 1, perPage: 20, total: 0, totalPages: 0 },
  };
}

export async function fetchAdminTransactions(params = {}) {
  const response = await api.get('/api/admin/transactions', { params });
  return response.data;
}

export async function exportTransactionsCSV(params = {}) {
  const response = await api.get('/api/transactions/export', {
    params,
    responseType: 'blob',
  });

  const filename = buildDefaultFilename();
  downloadBlob(response.data, filename);
}
