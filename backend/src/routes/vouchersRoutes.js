import { Router } from 'express';
import multer from 'multer';
import { uploadVouchersCsv } from '../controllers/vouchersController.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Admin
// POST /api/vouchers/upload (multipart/form-data: file + package_id)
router.post('/upload', upload.single('file'), uploadVouchersCsv);

export default router;
