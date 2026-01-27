import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api';

if (!baseURL) {
  // Keep this loud: misconfiguration should be obvious in dev.
  // eslint-disable-next-line no-console
  console.warn('VITE_API_BASE_URL is not set. Requests will likely fail.');
}

export const api = axios.create({
  baseURL,
  timeout: 15000,
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
