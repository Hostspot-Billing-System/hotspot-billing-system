import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '') || '';
if (!baseURL && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn('VITE_API_BASE_URL is not set. API calls will fail.');
}

export const api = axios.create({
  baseURL,
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

if (import.meta.env.DEV) {
  api.interceptors.request.use(
    (config) => {
      console.debug('[api] request', {
        method: config.method,
        baseURL: config.baseURL,
        url: config.url,
        withCredentials: config.withCredentials,
      });
      return config;
    },
    (error) => {
      console.debug('[api] request error', error);
      return Promise.reject(error);
    }
  );

  api.interceptors.response.use(
    (response) => {
      console.debug('[api] response', {
        url: response?.config?.url,
        status: response.status,
        data: response.data,
      });
      return response;
    },
    (error) => {
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