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

const PLACEHOLDER_TRANSACTIONS = Array.from({ length: 4 }).map((_, index) => ({
  id: index + 1,
  date: '—',
  bundle: '—',
  amount: '—',
  commission: '—',
  paymentMethod: '—',
  status: '—',
}));

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

  const statValues = useMemo(() => {
    const todayRevenue = metrics?.today_revenue_ugx;
    const voucherStock = metrics?.voucher_stock_available;
    const totalWithdrawals = metrics?.total_withdrawals_ugx;
    const failedToday = metrics?.failed_transactions_today;
    const smsStatus = metrics?.sms_status;

    return {
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
            right={<Chip label="Placeholder" size="small" variant="outlined" />}
          />
        </Stack>

        <TableContainer>
          <Table size="small" aria-label="recent transactions">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 900 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Bundle</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Commission</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Payment Method</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {PLACEHOLDER_TRANSACTIONS.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.bundle}</TableCell>
                  <TableCell>{row.amount}</TableCell>
                  <TableCell>{row.commission}</TableCell>
                  <TableCell>{row.paymentMethod}</TableCell>
                  <TableCell>{row.status}</TableCell>
                </TableRow>
              ))}
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
