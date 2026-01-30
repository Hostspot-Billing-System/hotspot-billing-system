import { Router } from 'express';
import {
  getWithdrawableBalance,
  getWithdrawalById,
  listWithdrawals,
  requestWithdrawal,
} from '../controllers/withdrawalsController.js';

const router = Router();

// GET /api/withdrawals/balance
router.get('/balance', getWithdrawableBalance);

// POST /api/withdrawals/request
router.post('/request', requestWithdrawal);

// GET /api/withdrawals?page=&perPage=
router.get('/', listWithdrawals);

// GET /api/withdrawals/:id
router.get('/:id', getWithdrawalById);

export default router;
