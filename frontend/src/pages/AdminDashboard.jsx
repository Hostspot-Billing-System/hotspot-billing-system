import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  SvgIcon,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

import { api } from '../services/api';

const STAT_CARDS = [
  { key: 'todaysRevenue', title: "Today’s Revenue", color: '#3b82f6' },
  { key: 'voucherStock', title: 'Voucher Stock', color: '#22c55e' },
  { key: 'totalWithdrawals', title: 'Total Withdrawals', color: '#7c3aed' },
  { key: 'failedToday', title: 'Failed Today', color: '#f97316' },
  { key: 'smsStatus', title: 'SMS Status', color: '#06b6d4' },
];

const QUICK_ACTIONS = [
  { key: 'uploadVouchers', label: 'Upload Vouchers', color: '#3b82f6' },
  { key: 'createBundle', label: 'Create Bundle', color: '#22c55e' },
  { key: 'viewTransactions', label: 'View Transactions', color: '#06b6d4' },
  { key: 'viewReports', label: 'View Reports', color: '#eab308' },
  { key: 'changePassword', label: 'Change Password', color: '#f59e0b' },
];

function formatStatusLabel(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'completed' || s === 'success') return 'Success';
  if (s === 'failed') return 'Failed';
  if (s === 'pending') return 'Pending';
  return status ?? '—';
}

function ActionIcon({ name }) {
  const common = { fontSize: 'small', sx: { mr: 1 } };
  if (name === 'uploadVouchers') {
    return (
      <SvgIcon {...common} viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M19 15v4H5v-4H3v6h18v-6h-2ZM11 5.41V16h2V5.41l3.29 3.3 1.42-1.42L12 1.59 6.29 7.29l1.42 1.42L11 5.41Z"
        />
      </SvgIcon>
    );
  }
  if (name === 'createBundle') {
    return (
      <SvgIcon {...common} viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z"
        />
      </SvgIcon>
    );
  }
  if (name === 'viewTransactions') {
    return (
      <SvgIcon {...common} viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M3 5h18v2H3V5Zm0 6h18v2H3v-2Zm0 6h18v2H3v-2Z"
        />
      </SvgIcon>
    );
  }
  if (name === 'viewReports') {
    return (
      <SvgIcon {...common} viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M3 3h2v18H3V3Zm4 12h2v6H7v-6Zm4-8h2v14h-2V7Zm4 4h2v10h-2V11Zm4-6h2v16h-2V5Z"
        />
      </SvgIcon>
    );
  }
  if (name === 'changePassword') {
    return (
      <SvgIcon {...common} viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M7 14a5 5 0 1 1 9.9 1H21v4h-3v-2h-2v2h-3v-4h-1.1A5 5 0 0 1 7 14Zm5-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
        />
      </SvgIcon>
    );
  }

  return null;
}

function StatCardValue({ loading, value }) {
  if (loading) {
    return <Skeleton variant="text" sx={{ bgcolor: 'rgba(255,255,255,0.35)' }} width="70%" />;
  }
  return value ?? '--';
}

function StatCardFooter({ loading, footer }) {
  if (loading) {
    return <Skeleton variant="text" sx={{ bgcolor: 'rgba(255,255,255,0.25)' }} width="55%" />;
  }
  return footer ?? '—';
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '0');
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SectionHeader({ title, right }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
      }}
    >
      <Typography variant="h6" fontWeight={800}>
        {title}
      </Typography>
      {right}
    </Box>
  );
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState(null);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recent, setRecent] = useState([]);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'error' });
  const [showRenewalReminder, setShowRenewalReminder] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const response = await api.get('/api/admin/dashboard/metrics');
        const data = response?.data ?? null;
        if (!cancelled) setMetrics(data);
      } catch (e) {
        const message =
          e?.response?.data?.error?.message ??
          e?.response?.data?.message ??
          e?.message ??
          'Failed to load dashboard metrics';
        if (!cancelled) setSnack({ open: true, message, severity: 'error' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setRecentLoading(true);
      try {
        const response = await api.get('/api/admin/dashboard/recent-transactions');
        const list = Array.isArray(response?.data?.data) ? response.data.data : [];
        if (!cancelled) setRecent(list);
      } catch (e) {
        const message =
          e?.response?.data?.error?.message ??
          e?.response?.data?.message ??
          e?.message ??
          'Failed to load recent transactions';
        if (!cancelled) setSnack({ open: true, message, severity: 'error' });
        if (!cancelled) setRecent([]);
      } finally {
        if (!cancelled) setRecentLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const statValues = useMemo(() => {
    const todayRevenue = metrics?.today_revenue_ugx;
    const voucherStock = metrics?.voucher_stock_available;
    const totalWithdrawals = metrics?.total_withdrawals_ugx;
    const failedToday = metrics?.failed_transactions_today;
    const smsStatus = metrics?.sms_status;

    const todayTxnCount =
      metrics?.successful_transactions_today ??
      metrics?.transactions_today ??
      metrics?.today_transactions ??
      0;

    const completedPayouts =
      metrics?.completed_payouts ??
      metrics?.completed_payouts_count ??
      metrics?.withdrawals_completed_count ??
      metrics?.completed_withdrawals_count ??
      0;

    const failedAmount =
      metrics?.failed_amount_today_ugx ??
      metrics?.failed_today_amount_ugx ??
      0;

    return {
      todaysRevenue: {
        value: todayRevenue != null ? `UGX ${formatMoney(todayRevenue)}` : '--',
        footer: `From ${Number(todayTxnCount) || 0} transactions today`,
      },
      voucherStock: {
        value:
          voucherStock != null && Number.isFinite(Number(voucherStock))
            ? Number(voucherStock).toLocaleString()
            : '--',
        footer: 'Available vouchers',
      },
      totalWithdrawals: {
        value: totalWithdrawals != null ? `UGX ${formatMoney(totalWithdrawals)}` : '--',
        footer: `${Number(completedPayouts) || 0} completed payouts`,
      },
      failedToday: {
        value: `UGX ${formatMoney(failedAmount)}`,
        footer: `${Number(failedToday) || 0} failed transactions`,
      },
      smsStatus: {
        value: smsStatus,
      },
    };
  }, [metrics]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" fontWeight={900}>
          Welcome, Admin
        </Typography>
      </Box>

      {showRenewalReminder ? (
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'rgba(2,132,199,0.25)',
            bgcolor: '#d7f4ff',
            px: 2,
            py: 1.35,
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <SvgIcon viewBox="0 0 24 24" sx={{ color: '#0284c7' }}>
              <path
                fill="currentColor"
                d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z"
              />
            </SvgIcon>
            <Typography variant="body2" sx={{ color: '#075985', fontWeight: 600, flex: 1 }}>
              <span style={{ fontWeight: 800 }}>Renewal Reminder:</span> Your account expires in 25 day(s) (Mar 1, 2026). Consider contacting admin for renewal.
            </Typography>
            <IconButton
              aria-label="Dismiss renewal reminder"
              size="small"
              onClick={() => setShowRenewalReminder(false)}
              sx={{ color: '#075985' }}
            >
              <SvgIcon viewBox="0 0 24 24" fontSize="small">
                <path
                  fill="currentColor"
                  d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.71 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3 1.42 1.42Z"
                />
              </SvgIcon>
            </IconButton>
          </Stack>
        </Paper>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)',
            lg: 'repeat(5, 1fr)',
          },
        }}
      >
        {STAT_CARDS.map((card) => {
          const v = statValues?.[card.key];
          return (
            <Box key={card.key} sx={{ minHeight: 170 }}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 2,
                  bgcolor: card.color,
                  color: 'common.white',
                  boxShadow: '0 10px 20px rgba(0,0,0,0.10)',
                }}
              >
                <CardContent sx={{ height: '100%' }}>
                  <Stack spacing={1} sx={{ height: '100%' }}>
                    <Typography
                      variant="subtitle2"
                      fontWeight={500}
                      sx={{
                        color: 'rgba(255,255,255,0.95)',
                        letterSpacing: 0.2,
                      }}
                    >
                      {card.title}
                    </Typography>

                    {card.key === 'smsStatus' ? (
                      <Stack spacing={1} sx={{ pt: 0.5 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            gap: 1,
                            minHeight: 44,
                          }}
                        >
                          <SvgIcon viewBox="0 0 24 24" sx={{ color: 'white' }}>
                            <path
                              fill="currentColor"
                              d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 14-4-4 1.41-1.41L11 13.17l5.59-5.58L18 9l-7 7Z"
                            />
                          </SvgIcon>
                          <Typography
                            variant="h6"
                            sx={(theme) => ({
                              fontWeight: 400,
                              fontSize: `calc(${theme.typography.h6.fontSize} * 0.84)`,
                            })}
                          >
                            {loading ? (
                              <Skeleton variant="text" sx={{ bgcolor: 'rgba(255,255,255,0.35)' }} width="65%" />
                            ) : (
                              'Using Custom SMS API'
                            )}
                          </Typography>
                        </Box>
                        <Box sx={{ flexGrow: 1 }} />
                      </Stack>
                    ) : (
                      <>
                        <Typography
                          variant="h4"
                          sx={(theme) => ({
                            fontWeight: 400,
                            fontSize: `calc(${theme.typography.h4.fontSize} * 0.84)`,
                          })}
                        >
                          <StatCardValue loading={loading} value={v?.value} />
                        </Typography>
                        <Box sx={{ flexGrow: 1 }} />
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>
                          <StatCardFooter loading={loading} footer={v?.footer} />
                        </Typography>
                      </>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Box>
          );
        })}
      </Box>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack spacing={2}>
          <SectionHeader title="Quick Actions" />

          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
                lg: 'repeat(5, 1fr)',
              },
            }}
          >
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.key}
                variant="contained"
                onClick={() => console.log(`[dashboard] action: ${action.key}`)}
                sx={{
                  justifyContent: 'center',
                  textTransform: 'none',
                  fontWeight: 800,
                  py: 1.35,
                  minHeight: 44,
                  borderRadius: 2,
                  bgcolor: action.color,
                  boxShadow: '0 6px 14px rgba(0,0,0,0.18)',
                  '&:hover': {
                    bgcolor: action.color,
                    filter: 'brightness(0.92)',
                  },
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                  <ActionIcon name={action.key} />
                  <span>{action.label}</span>
                </Stack>
              </Button>
            ))}
          </Box>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 2 }}>
        <Stack spacing={2} sx={{ p: 2 }}>
          <SectionHeader
            title="Recent Transactions"
            right={
              <Chip
                label={recentLoading ? 'Loading…' : 'Live'}
                size="small"
                variant="outlined"
              />
            }
          />
        </Stack>

        <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Table size="small" aria-label="recent transactions" sx={{ minWidth: { xs: 720, md: 0 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 900 }}>Date/Time</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Reference</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Phone</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Bundle</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentLoading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <TableRow key={`recent-skel-${idx}`}>
                    <TableCell colSpan={6}>
                      <Skeleton variant="text" width="90%" />
                    </TableCell>
                  </TableRow>
                ))
              ) : recent.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ color: 'text.secondary' }}>
                    No recent mobile money transactions.
                  </TableCell>
                </TableRow>
              ) : (
                recent.map((row) => (
                  <TableRow key={row.reference ?? row.date_time} hover>
                    <TableCell>{row.date_time ? new Date(row.date_time).toLocaleString() : '—'}</TableCell>
                    <TableCell>{row.reference ?? '—'}</TableCell>
                    <TableCell>{row.customer_phone ?? '—'}</TableCell>
                    <TableCell>{row.bundle_name ?? '—'}</TableCell>
                    <TableCell>{row.amount_ugx != null ? `UGX ${formatMoney(row.amount_ugx)}` : '—'}</TableCell>
                    <TableCell>{formatStatusLabel(row.status)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
