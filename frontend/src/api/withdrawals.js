import { api } from '../services/api';
import { apiFetch } from '../utils/requests';

function throwServerMessage(error, fallbackMessage) {
  const message =
    error?.response?.data?.error?.message ??
    error?.response?.data?.message ??
    error?.message ??
    fallbackMessage;
  throw new Error(message);
}

export async function previewWithdrawal(amount) {
  try {
    const response = await api.post('/api/withdrawals/preview', { amount });
    return response.data;
  } catch (e) {
    throwServerMessage(e, 'Failed to preview withdrawal');
  }
}

export async function getWithdrawableBalance() {
  try {
    const response = await api.get('/api/withdrawals/balance');
    return Number(response.data?.withdrawable_amount_ugx ?? 0);
  } catch (e) {
    throwServerMessage(e, 'Failed to load withdrawable balance');
  }
}

export async function getWithdrawableSummary() {
  try {
    const response = await api.get('/api/withdrawals/balance');
    return response.data;
  } catch (e) {
    throwServerMessage(e, 'Failed to load withdrawable summary');
  }
}

export async function requestWithdrawal(payload) {
  try {
    const response = await api.post('/api/withdrawals/request', payload);
    return response.data;
  } catch (e) {
    throwServerMessage(e, 'Failed to request withdrawal');
  }
}

export async function verifyWithdrawal(payload) {
  try {
    const response = await api.post('/api/withdrawals/verify', payload);
    return response.data;
  } catch (e) {
    throwServerMessage(e, 'Failed to verify withdrawal');
  }
}

export async function fetchWithdrawals(params = {}) {
  try {
    const response = await api.get('/api/withdrawals', { params });
    return {
      data: Array.isArray(response.data?.data) ? response.data.data : [],
      meta: response.data?.meta ?? { page: 1, perPage: 20, total: 0, totalPages: 0 },
    };
  } catch (e) {
    throwServerMessage(e, 'Failed to load withdrawals');
  }
}

export async function fetchWithdrawalDetails(id) {
  try {
    const data = await apiFetch(`/api/withdrawals/${id}`);
    return data?.data;
  } catch (e) {
    throwServerMessage(e, 'Failed to load withdrawal details');
  }
}
