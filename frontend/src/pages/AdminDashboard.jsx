import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
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
  { key: 'totalMobileMoney', title: 'Total Mobile Money', color: '#0ea5e9' },
  { key: 'successfulToday', title: 'Successful Today', color: '#16a34a' },
  { key: 'todaysRevenue', title: "Today’s Revenue", color: '#3b82f6' },
  { key: 'voucherStock', title: 'Voucher Stock', color: '#22c55e' },
  { key: 'totalWithdrawals', title: 'Total Withdrawals', color: '#7c3aed' },
  { key: 'failedToday', title: 'Failed Today', color: '#f97316' },
  { key: 'smsStatus', title: 'SMS Status', color: '#06b6d4' },
];

const QUICK_ACTIONS = [
  { key: 'uploadVouchers', label: 'Upload Vouchers', color: '#3b82f6' },
  { key: 'manageBundles', label: 'Manage Bundles', color: '#22c55e' },
  { key: 'viewTransactions', label: 'View Transactions', color: '#06b6d4' },
  { key: 'viewReports', label: 'View Reports', color: '#eab308' },
  { key: 'withdrawFunds', label: 'Withdraw Funds', color: '#1d4ed8' },
];

function formatStatusLabel(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'completed' || s === 'success') return 'Success';
  if (s === 'failed') return 'Failed';
  if (s === 'pending') return 'Pending';
  return status ?? '—';
}

function StatCard({ title, color }) {
  return (
    <Card
      sx={{
        height: '100%',
        borderRadius: 2,
        bgcolor: color,
        color: 'common.white',
        boxShadow: '0 10px 20px rgba(0,0,0,0.10)',
      }}
    >
      <CardContent sx={{ height: '100%' }}>
        <Stack spacing={1} sx={{ height: '100%' }}>
          <Typography
            variant="subtitle2"
            fontWeight={800}
            sx={{
              color: 'rgba(255,255,255,0.95)',
              letterSpacing: 0.2,
            }}
          >
            {title}
          </Typography>
          <Typography variant="h4" fontWeight={800}>
            --
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>
            Placeholder
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
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
    const totalMobileMoney = metrics?.total_mobile_money_transactions;
    const successfulToday = metrics?.successful_transactions_today;
    const todayRevenue = metrics?.today_revenue_ugx;
    const voucherStock = metrics?.voucher_stock_available;
    const totalWithdrawals = metrics?.total_withdrawals_ugx;
    const failedToday = metrics?.failed_transactions_today;
    const smsStatus = metrics?.sms_status;

    return {
      totalMobileMoney: {
        value:
          totalMobileMoney != null && Number.isFinite(Number(totalMobileMoney))
            ? Number(totalMobileMoney).toLocaleString()
            : '--',
        footer: 'All time (mobile money)',
      },
      successfulToday: {
        value:
          successfulToday != null && Number.isFinite(Number(successfulToday))
            ? Number(successfulToday).toLocaleString()
            : '--',
        footer: 'Today only',
      },
      todaysRevenue: {
        value: todayRevenue != null ? `UGX ${formatMoney(todayRevenue)}` : '--',
        footer: 'Updated live',
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
        footer: 'All time',
      },
      failedToday: {
        value:
          failedToday != null && Number.isFinite(Number(failedToday))
            ? Number(failedToday).toLocaleString()
            : '--',
        footer: 'Today only',
      },
      smsStatus: {
        value: smsStatus === true ? 'OK' : smsStatus === false ? 'Down' : '--',
        footer: 'Last 5 minutes',
      },
    };
  }, [metrics]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" fontWeight={900}>
          Welcome, Admin
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Admin dashboard overview (UI skeleton).
        </Typography>
      </Box>

      <Alert severity="info" variant="outlined">
        <Typography variant="subtitle2" fontWeight={800} component="span">
          Account Expiry Notice:
        </Typography>{' '}
        <Typography variant="body2" component="span">
          Your account expires in -- day(s) (--- --, ----). Placeholder banner.
        </Typography>
      </Alert>

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
        {STAT_CARDS.map((card) => (
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
                    fontWeight={800}
                    sx={{
                      color: 'rgba(255,255,255,0.95)',
                      letterSpacing: 0.2,
                    }}
                  >
                    {card.title}
                  </Typography>
                  <Typography variant="h4" fontWeight={800}>
                    <StatCardValue loading={loading} value={statValues?.[card.key]?.value} />
                  </Typography>
                  <Box sx={{ flexGrow: 1 }} />
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>
                    <StatCardFooter loading={loading} footer={statValues?.[card.key]?.footer} />
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Box>
        ))}
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
                {action.label}
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
