import express from "express";
import {
  getAdminDashboardMetrics,
  getAdminDashboardRecentTransactions,
  getAdminEmailDiagnostics,
} from "../controllers/adminDashboardController.js";
import { listAdminTransactions } from "../controllers/adminTransactionsController.js";
import { getAdminWithdrawalsSummary } from "../controllers/adminWithdrawalsController.js";

const router = express.Router();

router.get("/email-diagnostics", getAdminEmailDiagnostics);
router.get("/dashboard/metrics", getAdminDashboardMetrics);
router.get("/dashboard/recent-transactions", getAdminDashboardRecentTransactions);
router.get("/transactions", listAdminTransactions);
router.get("/withdrawals/summary", getAdminWithdrawalsSummary);

export default router;
