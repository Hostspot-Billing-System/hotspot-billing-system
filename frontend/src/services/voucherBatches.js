import { apiFetch } from '../utils/requests';

export async function getVoucherBatches({ page = 1, limit = 25 } = {}) {
  const params = new URLSearchParams({ page, limit });
  return apiFetch(`/api/voucher-batches?${params.toString()}`);
}

export async function getVouchersForBatch({ batchId, page = 1, limit = 25 } = {}) {
  const params = new URLSearchParams({ page, limit });
  return apiFetch(`/api/voucher-batches/${batchId}/vouchers?${params.toString()}`);
}
