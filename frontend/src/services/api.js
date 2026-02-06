import axios from 'axios';

function shouldIgnoreLocalhostBaseUrl(candidate) {
  try {
    if (!candidate || typeof candidate !== 'string') return false;
    if (typeof window === 'undefined' || !window.location?.hostname) return false;

    const currentHost = String(window.location.hostname);
    const isCurrentLocal = currentHost === 'localhost' || currentHost === '127.0.0.1';
    if (isCurrentLocal) return false;

    const url = new URL(candidate);
    const targetHost = String(url.hostname);
    const isTargetLocal = targetHost === 'localhost' || targetHost === '127.0.0.1';
    return isTargetLocal;
  } catch {
    return false;
  }
}

// IMPORTANT:
// Most frontend services in this repo call URLs like '/api/...'.
// So the safest default baseURL is '' (same-origin), relying on Vite's '/api' proxy in dev.
// When running the portal UI from another device, a localhost base URL would point to *that device*;
// in that case we ignore it and use same-origin so the proxy can still work.
const envBaseURL = import.meta.env.VITE_API_BASE_URL;
const baseURL = shouldIgnoreLocalhostBaseUrl(envBaseURL) ? '' : (envBaseURL ?? '');

if (!baseURL) {
  // Keep this loud: misconfiguration should be obvious in dev.
  // eslint-disable-next-line no-console
  console.warn('VITE_API_BASE_URL is not set. Requests will likely fail.');
}

export const api = axios.create({
  baseURL,
  timeout: 15000,
  withCredentials: true,
});

// Temporary debug logging (dev only)
if (import.meta.env.DEV) {
  api.interceptors.request.use(
    (config) => {
      // eslint-disable-next-line no-console
      console.debug('[api] request', {
        method: config.method,
        baseURL: config.baseURL,
        url: config.url,
        withCredentials: config.withCredentials,
      });
      return config;
    },
    (error) => {
      // eslint-disable-next-line no-console
      console.debug('[api] request error', error);
      return Promise.reject(error);
    }
  );

  api.interceptors.response.use(
    (response) => {
      // eslint-disable-next-line no-console
      console.debug('[api] response', {
        url: response?.config?.url,
        status: response.status,
        data: response.data,
      });
      return response;
    },
    (error) => {
      // eslint-disable-next-line no-console
      console.debug('[api] response error', {
        message: error?.message,
        code: error?.code,
        url: error?.config?.url,
        baseURL: error?.config?.baseURL,
        status: error?.response?.status,
        data: error?.response?.data,
      });
      return Promise.reject(error);
    }
  );
}
