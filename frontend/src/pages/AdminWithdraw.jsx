import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

function Icon({ path, size = 18, color = 'currentColor' }) {
  return (
    <Box component="svg" viewBox="0 0 24 24" sx={{ width: size, height: size, display: 'block' }} aria-hidden>
      <path fill={color} d={path} />
    </Box>
  );
}

const ICONS = {
  info:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z',
  check:
    'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z',
};

function StatCard({ title, value, subtitle, color }) {
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
      <CardContent>
        <Stack spacing={1}>
          <Typography variant="subtitle2" fontWeight={800} sx={{ opacity: 0.95 }}>
            {title}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.9, fontWeight: 800 }}>
            UGX
          </Typography>
          <Typography variant="h4" fontWeight={900}>
            {value}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function formatMoney(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '0');
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatDateOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatTimeOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function StatusPill({ status }) {
  const s = String(status ?? '').toLowerCase();
  const isCompleted = s === 'completed' || s === 'success' || s === 'paid';
  const isPending = s === 'pending' || s === 'processing';

  return (
    <Chip
      size="small"
      label={status ?? '—'}
      sx={{
        height: 20,
        fontWeight: 900,
        fontSize: 11,
        borderRadius: 999,
        bgcolor: isCompleted ? '#15803d' : isPending ? '#f59e0b' : '#64748b',
        color: 'common.white',
        '& .MuiChip-label': { px: 1, py: 0 },
      }}
    />
  );
}

const WITHDRAWAL_CHARGES = [
  { range: '500 - 60,000', fee: 600 },
  { range: '60,001 - 500,000', fee: 1200 },
  { range: '500,001 - 1,000,000', fee: 2000 },
  { range: '1,000,001 - 5,000,000', fee: 2400 },
];

const PLACEHOLDER_WITHDRAWALS = [
  { id: 1, created_at: '2026-01-30T21:41:00.000Z', amount: 9574.47, number: '0791162099', status: 'Completed' },
  { id: 2, created_at: '2026-01-28T11:31:00.000Z', amount: 228148.94, number: '0791162099', status: 'Completed' },
  { id: 3, created_at: '2025-12-24T20:34:00.000Z', amount: 7446.81, number: '0789193523', status: 'Completed' },
  { id: 4, created_at: '2025-12-20T14:30:00.000Z', amount: 101489.36, number: '0789193523', status: 'Completed' },
  { id: 5, created_at: '2025-12-06T13:49:00.000Z', amount: 4787.23, number: '0750629696', status: 'Completed' },
  { id: 6, created_at: '2025-12-06T13:44:00.000Z', amount: 2127.66, number: '0750629696', status: 'Completed' },
  { id: 7, created_at: '2025-11-28T21:05:00.000Z', amount: 49840.43, number: '0707434218', status: 'Completed' },
  { id: 8, created_at: '2025-11-26T20:21:00.000Z', amount: 17659.57, number: '0707434218', status: 'Completed' },
  { id: 9, created_at: '2025-11-17T17:58:00.000Z', amount: 4010.64, number: '0707434218', status: 'Completed' },
  { id: 10, created_at: '2025-11-17T09:23:00.000Z', amount: 16595.74, number: '0707434218', status: 'Completed' },
];

function normalizePhoneNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';

  // Accept formats like 2567XXXXXXXX or 07XXXXXXXX
  if (digits.startsWith('256') && digits.length >= 12) return digits.slice(0, 12);
  if (digits.startsWith('0') && digits.length >= 10) return digits.slice(0, 10);
  if (digits.startsWith('7') && digits.length >= 9) return `0${digits.slice(0, 9)}`;

  return digits;
}

export default function AdminWithdraw() {
  // Placeholder balances until we wire a real API.
  const totalEarnings = 20925.53;
  const commissionRate = 0.06;
  const commission = 1255.53;
  const withdrawable = 19670.0;

  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [snack, setSnack] = useState({ open: false, severity: 'info', message: '' });

  const normalizedPhone = useMemo(() => normalizePhoneNumber(phone), [phone]);
  const maskedPhone = useMemo(() => {
    const p = normalizedPhone;
    if (!p) return '********';
    const keep = 4;
    const last = p.slice(-keep);
    return `******${last}`;
  }, [normalizedPhone]);

  function showSnack(severity, message) {
    setSnack({ open: true, severity, message });
  }

  async function onRequestWithdraw() {
    const amountN = Number(String(amount).replace(/,/g, ''));

    if (!Number.isFinite(amountN) || amountN <= 0) {
      showSnack('error', 'Enter a valid withdrawal amount.');
      return;
    }

    if (amountN < 500) {
      showSnack('error', 'Minimum withdrawal amount is UGX 500.');
      return;
    }

    if (amountN > withdrawable) {
      showSnack('error', `Amount exceeds withdrawable balance (UGX ${formatMoney(withdrawable)}).`);
      return;
    }

    if (!normalizedPhone || (normalizedPhone.length !== 10 && normalizedPhone.length !== 12)) {
      showSnack('error', 'Enter a valid mobile money number (07XXXXXXXX or 2567XXXXXXXX).');
      return;
    }

    setSubmitting(true);
    try {
      // TODO: wire to backend (withdraw endpoint + OTP verification flow)
      await new Promise((r) => setTimeout(r, 750));
      showSnack('success', 'Withdrawal request submitted (placeholder).');
      setAmount('');
    } catch {
      showSnack('error', 'Failed to submit withdrawal request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box sx={{ width: '100%', pt: 1, pb: 5, px: 0 }}>
      <Typography variant="h4" fontWeight={900}>
        Withdraw Earnings
      </Typography>

      <Box
        sx={{
          mt: 2,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
        }}
      >
        <StatCard
          title="Total Earnings"
          value={formatMoney(totalEarnings)}
          subtitle="After subtracting pending and completed withdrawals"
          color="#3b82f6"
        />
        <StatCard
          title="Our Commission"
          value={formatMoney(commission)}
          subtitle={`At ${(commissionRate * 100).toFixed(2)}% rate`}
          color="#22c55e"
        />
        <StatCard
          title="Withdrawable Account"
          value={formatMoney(withdrawable)}
          subtitle="Available to request now"
          color="#7c3aed"
        />
      </Box>

      <Box
        sx={{
          mt: 3,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
          alignItems: 'start',
        }}
      >
        <Stack spacing={2}>
          <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid #e5e7eb', bgcolor: 'common.white' }}>
            <Stack spacing={2} sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={900}>
                Balance Summary
              </Typography>

              <Box>
                <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                  Initial Amount
                </Typography>
                <Typography variant="h6" fontWeight={900} sx={{ mt: 0.5 }}>
                  UGX {formatMoney(totalEarnings)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                  Deductions
                </Typography>
                <Stack direction="row" sx={{ mt: 0.75 }} alignItems="center" justifyContent="space-between">
                  <Typography variant="body2">Commission ({(commissionRate * 100).toFixed(2)}%):</Typography>
                  <Typography variant="body2" sx={{ color: '#ef4444', fontWeight: 900 }}>
                    UGX {formatMoney(commission)}
                  </Typography>
                </Stack>
              </Box>

              <Divider sx={{ borderColor: '#eef2f7' }} />

              <Box>
                <Typography variant="subtitle2" sx={{ color: '#15803d', fontWeight: 900 }}>
                  Final Balance
                </Typography>
                <Typography variant="h5" fontWeight={900} sx={{ mt: 0.5 }}>
                  UGX {formatMoney(withdrawable)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Available for withdrawal after deducting commission on remaining balance
                </Typography>
              </Box>
            </Stack>
          </Paper>

          <Paper
            elevation={0}
            sx={{
              borderRadius: 2,
              border: '1px solid #e5e7eb',
              bgcolor: 'common.white',
            }}
          >
            <Stack spacing={2} sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={900}>
                Request Withdrawal
              </Typography>

              <Paper
                elevation={0}
                sx={{
                  borderRadius: 1.5,
                  border: '1px solid #bae6fd',
                  bgcolor: '#cffafe',
                  overflow: 'hidden',
                }}
              >
                <Box sx={{ px: 2, py: 1.25 }}>
                  <Typography variant="subtitle2" fontWeight={900} sx={{ color: '#0f172a' }}>
                    Withdrawal Charges
                  </Typography>
                </Box>

                <Divider sx={{ borderColor: 'rgba(15,23,42,0.12)' }} />

                <TableContainer>
                  <Table size="small" sx={{ '& th': { fontWeight: 900, bgcolor: 'rgba(255,255,255,0.55)' } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Amount (UGX)</TableCell>
                        <TableCell>Price per Transaction (UGX)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {WITHDRAWAL_CHARGES.map((r) => (
                        <TableRow key={r.range}>
                          <TableCell>{r.range}</TableCell>
                          <TableCell>{r.fee.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Box sx={{ p: 2 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Icon path={ICONS.check} size={16} color="#0f766e" />
                      <Typography variant="body2">Minimum transaction amount is UGX 500.</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Icon path={ICONS.check} size={16} color="#0f766e" />
                      <Typography variant="body2">Mobile Money is both Airtel & MTN.</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Icon path={ICONS.check} size={16} color="#0f766e" />
                      <Typography variant="body2">You will only be charged for successful transactions.</Typography>
                    </Stack>
                  </Stack>
                </Box>
              </Paper>

              <TextField
                label="Amount to Withdraw (UGX)"
                size="small"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder=""
                inputMode="numeric"
              />

              <TextField
                label="Mobile Money Number"
                size="small"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="256772123456 or 0772123456"
                helperText="Enter the mobile money number where you want to receive the money"
              />

              <Alert severity="info" icon={<Icon path={ICONS.info} size={18} color="#0284c7" />}>
                For security, the verification OTP will be sent to your registered phone number: {maskedPhone}
              </Alert>

              <Button
                variant="contained"
                fullWidth
                disabled={submitting}
                onClick={onRequestWithdraw}
                sx={{
                  mt: 1,
                  textTransform: 'none',
                  borderRadius: 1,
                  fontWeight: 900,
                  py: 1.2,
                  bgcolor: '#2563eb',
                  '&:hover': { bgcolor: '#1d4ed8' },
                }}
              >
                {submitting ? 'Requesting…' : 'Request Withdrawal'}
              </Button>
            </Stack>
          </Paper>
        </Stack>

        <Paper elevation={0} sx={{ borderRadius: 2, border: '1px solid #e5e7eb', bgcolor: 'common.white' }}>
          <Stack spacing={2} sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={900}>
              Recent Withdrawals
            </Typography>
          </Stack>

          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 620, '& th': { fontWeight: 900, bgcolor: '#f8fafc' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Number</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {PLACEHOLDER_WITHDRAWALS.map((w) => (
                  <TableRow key={w.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box component="span" sx={{ display: 'block', fontWeight: 900 }}>
                        {formatDateOnly(w.created_at)}
                      </Box>
                      <Box component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                        {formatTimeOnly(w.created_at)}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>UGX {formatMoney(w.amount)}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{w.number}</TableCell>
                    <TableCell>
                      <StatusPill status={w.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
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
    </Box>
  );
}
