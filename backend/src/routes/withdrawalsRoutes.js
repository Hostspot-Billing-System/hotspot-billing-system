import { Router } from 'express';
import {
  getWithdrawableBalance,
  getWithdrawalById,
  listWithdrawals,
  previewWithdrawal,
  requestWithdrawal,
  verifyWithdrawal,
} from '../controllers/withdrawalsController.js';

const router = Router();

// POST /api/withdrawals/preview
router.post('/preview', previewWithdrawal);

// GET /api/withdrawals/balance
router.get('/balance', getWithdrawableBalance);

// POST /api/withdrawals/request
router.post('/request', requestWithdrawal);

// POST /api/withdrawals/verify
router.post('/verify', verifyWithdrawal);

// GET /api/withdrawals?page=&perPage=
router.get('/', listWithdrawals);

// GET /api/withdrawals/:id
router.get('/:id', getWithdrawalById);

export default router;
