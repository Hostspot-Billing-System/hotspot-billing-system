import { Router } from 'express';
import { listVoucherBatches, listVouchersForBatch } from '../controllers/voucherBatchesController.js';

const router = Router();

// Admin
// GET /api/voucher-batches
router.get('/', listVoucherBatches);

// GET /api/voucher-batches/:id/vouchers
router.get('/:id/vouchers', listVouchersForBatch);

export default router;
