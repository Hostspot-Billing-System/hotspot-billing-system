import { api } from './api';

// GET /api/voucher-batches
export function getVoucherBatches() {
  return api.get('/api/voucher-batches');
}
