import { Router } from 'express';
import { createTransaction, exportTransactions, listTransactions } from '../controllers/transactionsController.js';

const router = Router();

// GET /api/transactions/export?status=&bundle_id=&date_from=&date_to=&search=
router.get('/export', exportTransactions);

// POST /api/transactions
router.post('/', createTransaction);

// GET /api/transactions?status=&bundle_id=&date_from=&date_to=&search=&page=&limit=
router.get('/', listTransactions);

export default router;
