import { api } from './api';

// GET /api/transactions
// Supports filters: status, bundle_id, date_from, date_to, search, page, limit
export async function fetchTransactions(params = {}) {
  const response = await api.get('/api/transactions', { params });
  return response.data;
}

// GET /api/transactions/:id
// Note: requires backend route to exist.
export async function fetchTransactionById(id) {
  const response = await api.get(`/api/transactions/${encodeURIComponent(String(id))}`);
  return response.data;
}

function getFilenameFromContentDisposition(headerValue) {
  const value = String(headerValue ?? '');
  const match = value.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const filename = decodeURIComponent(match?.[1] ?? match?.[2] ?? '');
  return filename || null;
}

// GET /api/transactions/export
// Returns a CSV download as a Blob + suggested filename (if provided by backend).
export async function exportTransactionsCSV(params = {}) {
  const response = await api.get('/api/transactions/export', {
    params,
    responseType: 'blob',
  });

  const filename = getFilenameFromContentDisposition(response.headers?.['content-disposition']);

  return {
    blob: response.data,
    filename,
  };
}
