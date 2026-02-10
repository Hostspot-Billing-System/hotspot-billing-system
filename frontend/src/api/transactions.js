import { apiFetch } from '../utils/requests';

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

  const search = new URLSearchParams(params).toString();
  const data = await apiFetch(`/api/transactions?${search}`);
  return {
    data: Array.isArray(data?.data) ? data.data : [],
    meta: data?.meta ?? { page: 1, perPage: 20, total: 0, totalPages: 0 },
  };
}

  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/admin/transactions?${search}`);
}

  const search = new URLSearchParams(params).toString();
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/transactions/export?${search}`, {
    method: 'GET',
    credentials: 'include',
  });
  const blob = await res.blob();
  const filename = buildDefaultFilename();
  downloadBlob(blob, filename);
}
