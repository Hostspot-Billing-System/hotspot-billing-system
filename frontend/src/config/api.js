function normalizeApiBaseUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

export function buildApiUrl(path) {
  const normalizedPath = String(path ?? '');
  return `${API_BASE_URL}${normalizedPath}`;
}
