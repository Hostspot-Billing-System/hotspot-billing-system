import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL;

if (!baseURL) {
  // Keep this loud: misconfiguration should be obvious in dev.
  // eslint-disable-next-line no-console
  console.warn('VITE_API_BASE_URL is not set. Requests will likely fail.');
}

export const api = axios.create({
  baseURL,
  timeout: 15000,
});
