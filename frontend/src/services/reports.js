import { api } from './api';

export function getReportsSummary(params) {
  return api.get('/api/reports/summary', { params });
}

export function getDailyRevenue(params) {
  return api.get('/api/reports/daily-revenue', { params });
}

export function getBundlePerformance(params) {
  return api.get('/api/reports/bundle-performance', { params });
}

export function getBundlePerformanceDetails(params) {
  return api.get('/api/reports/bundle-performance-details', { params });
}

export function getPaymentMethods(params) {
  return api.get('/api/reports/payment-methods', { params });
}

export function getHourlySales(params) {
  return api.get('/api/reports/hourly-sales', { params });
}

export function getVoucherStats(params) {
  return api.get('/api/reports/voucher-stats', { params });
}

export function getVoucherDistribution(params) {
  return api.get('/api/reports/voucher-distribution', { params });
}

export function getRecentVoucherUsage(params) {
  return api.get('/api/reports/recent-voucher-usage', { params });
}
