import { Router } from 'express';
import multer from 'multer';
import {
  deleteBulkVouchers,
  deleteVoucher,
  listVouchers,
  verifyVoucher,
  uploadVouchersCsv,
  redeemVoucher,
} from '../controllers/vouchersController.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Admin
// GET /api/vouchers?status=&package_id=&batch_id=
router.get('/', listVouchers);

// GET /api/vouchers/verify?code=
router.get('/verify', verifyVoucher);

// POST /api/vouchers/delete-bulk { ids: number[] }
router.post('/delete-bulk', deleteBulkVouchers);

// DELETE /api/vouchers/:id
router.delete('/:id', deleteVoucher);

// POST /api/vouchers/upload (multipart/form-data: file + package_id)
router.post('/upload', upload.single('file'), uploadVouchersCsv);
router.post('/redeem', redeemVoucher);

export default router;
