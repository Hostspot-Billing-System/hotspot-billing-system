import { apiFetch } from '../utils/requests';
import { buildApiUrl } from '../config/api';

// GET /api/transactions
// Supports filters: status, bundle_id, date_from, date_to, search, page, limit
export async function fetchTransactions(params = {}) {
  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/transactions?${search}`);
}

// GET /api/transactions/:id
// Note: requires backend route to exist.
export async function fetchTransactionById(id) {
  return apiFetch(`/api/transactions/${encodeURIComponent(String(id))}`);
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
  const search = new URLSearchParams(params).toString();
  const res = await fetch(buildApiUrl(`/api/transactions/export?${search}`), {
    method: 'GET',
    credentials: 'include',
  });
  const blob = await res.blob();
  const filename = getFilenameFromContentDisposition(res.headers.get('content-disposition'));
  return { blob, filename };
}
