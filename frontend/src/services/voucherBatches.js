import { api } from './api';

export function getVoucherBatches({ page = 1, limit = 25 } = {}) {
  return api.get('/api/voucher-batches', {
    params: { page, limit },
  });
}

export function getVouchersForBatch({ batchId, page = 1, limit = 25 } = {}) {
  return api.get(`/api/voucher-batches/${batchId}/vouchers`, {
    params: { page, limit },
  });
}
