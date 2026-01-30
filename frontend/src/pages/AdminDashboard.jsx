import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

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
            <StatCard title={card.title} color={card.color} />
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
    </Stack>
  );
}
