import { apiFetch } from '../utils/requests';

export function getReportsSummary(params) {
  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/reports/summary?${search}`);
}

export function getDailyRevenue(params) {
  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/reports/daily-revenue?${search}`);
}

export function getBundlePerformance(params) {
  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/reports/bundle-performance?${search}`);
}

export function getBundlePerformanceDetails(params) {
  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/reports/bundle-performance-details?${search}`);
}

export function getPaymentMethods(params) {
  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/reports/payment-methods?${search}`);
}

export function getHourlySales(params) {
  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/reports/hourly-sales?${search}`);
}

export function getVoucherStats(params) {
  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/reports/voucher-stats?${search}`);
}

export function getVoucherDistribution(params) {
  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/reports/voucher-distribution?${search}`);
}

export function getRecentVoucherUsage(params) {
  const search = new URLSearchParams(params).toString();
  return apiFetch(`/api/reports/recent-voucher-usage?${search}`);
}
