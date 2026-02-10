import { Router } from 'express';
import {
	getAdminDashboardMetrics,
	getAdminDashboardRecentTransactions,
	getAdminEmailDiagnostics,
} from '../controllers/adminDashboardController.js';
// GET /api/admin/email-diagnostics
router.get('/email-diagnostics', getAdminEmailDiagnostics);
import { listAdminTransactions } from '../controllers/adminTransactionsController.js';
import { getAdminWithdrawalsSummary } from '../controllers/adminWithdrawalsController.js';

const router = Router();

// GET /api/admin/dashboard/metrics
router.get('/dashboard/metrics', getAdminDashboardMetrics);

// GET /api/admin/dashboard/recent-transactions
router.get('/dashboard/recent-transactions', getAdminDashboardRecentTransactions);

// GET /api/admin/transactions
router.get('/transactions', listAdminTransactions);

// GET /api/admin/withdrawals/summary
router.get('/withdrawals/summary', getAdminWithdrawalsSummary);

export default router;
