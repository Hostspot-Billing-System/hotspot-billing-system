import { Router } from 'express';
import {
  getBundlePerformance,
  getBundlePerformanceDetails,
  getDailyRevenue,
  getHourlySales,
  getPaymentMethods,
  getRecentVoucherUsage,
  getReportsSummary,
  getVoucherDistributionByBundle,
  getVoucherStats,
} from '../controllers/reportsController.js';

const router = Router();

// READ-ONLY reports endpoints
router.get('/summary', getReportsSummary);
router.get('/daily-revenue', getDailyRevenue);
router.get('/bundle-performance', getBundlePerformance);
router.get('/bundle-performance-details', getBundlePerformanceDetails);
router.get('/payment-methods', getPaymentMethods);
router.get('/hourly-sales', getHourlySales);
router.get('/voucher-stats', getVoucherStats);
router.get('/voucher-distribution', getVoucherDistributionByBundle);
router.get('/recent-voucher-usage', getRecentVoucherUsage);

export default router;
