import { Router } from 'express';
import { createTransaction, listTransactions } from '../controllers/transactionsController.js';

const router = Router();

// POST /api/transactions
router.post('/', createTransaction);

// GET /api/transactions?status=&bundle_id=&date_from=&date_to=&search=&page=&limit=
router.get('/', listTransactions);

export default router;
