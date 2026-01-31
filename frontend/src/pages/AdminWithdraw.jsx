import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  MenuItem,
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

import {
  fetchWithdrawals,
  getWithdrawableBalance,
  getWithdrawableSummary,
  previewWithdrawal,
  requestWithdrawal,
  verifyWithdrawal,
} from '../api/withdrawals';
import WithdrawalDetailsModal from '../components/WithdrawalDetailsModal';

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
  const isCompleted = s === 'completed';
  const isPending = s === 'pending' || s === 'processing' || s === 'approved';
  const isRejected = s === 'rejected';

  return (
    <Chip
      size="small"
      label={status ?? '—'}
      sx={{
        height: 20,
        fontWeight: 900,
        fontSize: 11,
        borderRadius: 999,
        bgcolor: isCompleted ? '#15803d' : isPending ? '#f59e0b' : isRejected ? '#ef4444' : '#64748b',
        color: 'common.white',
        '& .MuiChip-label': { px: 1, py: 0 },
      }}
    />
  );
}

const WITHDRAWAL_CHARGES = [
  { range: '500–60,000', fee: 600 },
  { range: '60,001–500,000', fee: 1200 },
  { range: '500,001–1,000,000', fee: 2000 },
  { range: '1,000,001–5,000,000', fee: 2400 },
];

function maskAccount(value) {
  const s = String(value ?? '').trim();
  if (!s) return '********';
  const keep = 4;
  const last = s.slice(-keep);
  return `******${last}`;
}

export default function AdminWithdraw() {
  const commissionRate = 0.06;

  const [amount, setAmount] = useState('');
  const [payoutPhone, setPayoutPhone] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('form');
  const [withdrawalId, setWithdrawalId] = useState(null);
  const [otp, setOtp] = useState('');
  const [verificationContact, setVerificationContact] = useState('');
  const [otpExpiresAt, setOtpExpiresAt] = useState(null);

  const [snack, setSnack] = useState({ open: false, severity: 'info', message: '' });

  const [balanceLoading, setBalanceLoading] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [commissionDeducted, setCommissionDeducted] = useState(0);
  const [withdrawable, setWithdrawable] = useState(0);
  const [balanceError, setBalanceError] = useState('');

  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [reloadKey, setReloadKey] = useState(0);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const maskedPayoutPhone = useMemo(() => maskAccount(payoutPhone), [payoutPhone]);

  const nonBlockingError = balanceError || listError;

  const commission = commissionDeducted;

  function showSnack(severity, message) {
    setSnack({ open: true, severity, message });
  }

  const parsedAmount = useMemo(() => {
    const n = Number(String(amount ?? '').trim());
    if (!Number.isFinite(n)) return null;
    return n;
  }, [amount]);

  const previewAllowed = useMemo(() => {
    if (!previewData) return true;
    if (typeof previewData.allowed === 'boolean') return previewData.allowed;
    return true;
  }, [previewData]);

  const otpExpired = useMemo(() => {
    if (!otpExpiresAt) return false;
    const t = new Date(otpExpiresAt).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() > t;
  }, [otpExpiresAt]);

  const minAmountOk = useMemo(() => (parsedAmount != null ? parsedAmount >= 500 : false), [parsedAmount]);
  const maxAmountOk = useMemo(() => {
    if (parsedAmount == null) return false;
    return parsedAmount <= Number(withdrawable ?? 0);
  }, [parsedAmount, withdrawable]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setError('');

      if (parsedAmount == null || parsedAmount <= 0) {
        setPreviewData(null);
        return;
      }

      setLoading(true);
      try {
        const res = await previewWithdrawal(parsedAmount);
        const data = res?.data ?? res;
        if (!cancelled) setPreviewData(data ?? null);
      } catch (e) {
        if (!cancelled) {
          setPreviewData(null);
          setError(e?.message ?? 'Failed to preview withdrawal');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [parsedAmount]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBalanceLoading(true);
      setBalanceError('');
      try {
        const summary = await getWithdrawableSummary();
        if (!cancelled) {
          setTotalEarnings(Number(summary?.total_earnings_ugx ?? 0));
          setCommissionDeducted(Number(summary?.commission_deducted_ugx ?? 0));
          setWithdrawable(Number(summary?.withdrawable_amount_ugx ?? 0));
        }
      } catch (e) {
        if (!cancelled) {
          setTotalEarnings(0);
          setCommissionDeducted(0);
          setWithdrawable(0);
          setBalanceError(e?.response?.data?.error?.message ?? e?.message ?? 'Failed to load withdrawable balance');
        }
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setListLoading(true);
      setListError('');
      try {
        const result = await fetchWithdrawals({ page, perPage });
        const list = Array.isArray(result?.data) ? result.data : [];
        if (!cancelled) {
          setRows(list);
          setTotal(Number(result?.meta?.total ?? 0));
          setPageCount(Math.max(1, Number(result?.meta?.totalPages ?? 1)));
        }
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          setPageCount(1);
          setListError(e?.response?.data?.error?.message ?? e?.message ?? 'Failed to load withdrawals');
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, perPage, reloadKey]);

  async function onRequestWithdraw() {
    setError('');

    if (loading) return;

    const phone = String(payoutPhone ?? '').trim();
    if (!phone) {
      setError('Enter a payout phone number.');
      return;
    }
    if (parsedAmount == null || parsedAmount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (parsedAmount < 500) {
      setError('Minimum withdrawal amount is UGX 500.');
      return;
    }
    if (parsedAmount > Number(withdrawable ?? 0)) {
      setError('Amount exceeds withdrawable balance.');
      return;
    }
    if (!previewAllowed) {
      setError('Withdrawal not allowed for this amount/balance.');
      return;
    }

    setLoading(true);
    try {
      const res = await requestWithdrawal({ amount: parsedAmount, payout_phone: phone });
      const data = res?.data ?? res;

      const id = data?.withdrawal_id ?? data?.id ?? null;
      const contact = data?.verification_contact ?? data?.verificationContact ?? '';
      const expiresAt = data?.otp_expires_at ?? null;

      setWithdrawalId(id);
      setVerificationContact(contact);
      setOtpExpiresAt(expiresAt);
      setStep('otp');
      setOtp('');
      showSnack('success', `OTP sent to ${contact || maskedPayoutPhone}`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e?.message ?? 'Failed to submit withdrawal request.');
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp() {
    setError('');

    if (loading) return;

    if (otpExpired) {
      setError('OTP expired. Please request a new OTP.');
      return;
    }

    const id = Number(withdrawalId);
    const otpValue = String(otp ?? '').trim();
    if (!Number.isFinite(id) || id <= 0) {
      setError('Missing withdrawal reference.');
      return;
    }
    if (!otpValue) {
      setError('Enter the OTP.');
      return;
    }
    if (!/^\d{6}$/.test(otpValue)) {
      setError('OTP must be 6 digits.');
      return;
    }

    setLoading(true);
    try {
      await verifyWithdrawal({ withdrawal_id: id, otp: otpValue });
      showSnack('success', 'Withdrawal verified successfully.');
      setStep('form');
      setWithdrawalId(null);
      setOtp('');
      setVerificationContact('');
      setOtpExpiresAt(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e?.message ?? 'Failed to verify OTP.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (step !== 'otp') return;
    if (!otpExpired) return;
    setError((prev) => prev || 'OTP expired. Please request a new OTP.');
  }, [step, otpExpired]);

  return (
    <Box sx={{ width: '100%', pt: 1, pb: 5, px: 0 }}>
      <Typography variant="h4" fontWeight={900}>
        Withdraw Earnings
      </Typography>

      {nonBlockingError ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {nonBlockingError}
        </Alert>
      ) : null}

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
          value={balanceLoading ? 'Loading…' : formatMoney(totalEarnings)}
          subtitle="After subtracting pending and completed withdrawals"
          color="#3b82f6"
        />
        <StatCard
          title="Our Commission"
          value={balanceLoading ? 'Loading…' : formatMoney(commission)}
          subtitle={`At ${(commissionRate * 100).toFixed(2)}% rate`}
          color="#22c55e"
        />
        <StatCard
          title="Withdrawable Account"
          value={balanceLoading ? 'Loading…' : formatMoney(withdrawable)}
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
                  UGX {balanceLoading ? 'Loading…' : formatMoney(totalEarnings)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                  Deductions
                </Typography>
                <Stack direction="row" sx={{ mt: 0.75 }} alignItems="center" justifyContent="space-between">
                  <Typography variant="body2">Commission ({(commissionRate * 100).toFixed(2)}%):</Typography>
                  <Typography variant="body2" sx={{ color: '#ef4444', fontWeight: 900 }}>
                    UGX {balanceLoading ? 'Loading…' : formatMoney(commission)}
                  </Typography>
                </Stack>
              </Box>

              <Divider sx={{ borderColor: '#eef2f7' }} />

              <Box>
                <Typography variant="subtitle2" sx={{ color: '#15803d', fontWeight: 900 }}>
                  Final Balance
                </Typography>
                <Typography variant="h5" fontWeight={900} sx={{ mt: 0.5 }}>
                  UGX {balanceLoading ? 'Loading…' : formatMoney(withdrawable)}
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

              {error ? <Alert severity="error">{error}</Alert> : null}

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
                        <TableCell>Fee (UGX)</TableCell>
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
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                      Fee is applied once per successful withdrawal
                    </Typography>
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

              {step === 'form' ? (
                <>
                  <TextField
                    label="Amount"
                    size="small"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 1000"
                    helperText="Enter the amount you want to withdraw"
                  />

                  <TextField
                    label="Payout Phone"
                    size="small"
                    value={payoutPhone}
                    onChange={(e) => setPayoutPhone(e.target.value)}
                    placeholder="e.g. 2567xxxxxxxx"
                    helperText="Enter the mobile money number where you want to receive the money"
                  />

                  <Paper
                    elevation={0}
                    sx={{
                      borderRadius: 1.5,
                      border: '1px solid #e5e7eb',
                      bgcolor: 'common.white',
                      p: 2,
                    }}
                  >
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                          Requested Amount
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 900 }}>
                          UGX {formatMoney(previewData?.requested_amount ?? parsedAmount ?? 0, 0)}
                        </Typography>
                      </Stack>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                          Transaction Fee
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 900 }}>
                          UGX {formatMoney(previewData?.withdrawal_fee ?? 0, 0)}
                        </Typography>
                      </Stack>
                      <Divider sx={{ borderColor: '#eef2f7' }} />
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" sx={{ color: '#15803d', fontWeight: 900 }}>
                          Net Amount (You will receive)
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 900, color: '#15803d' }}>
                          UGX {formatMoney(previewData?.net_amount ?? 0, 0)}
                        </Typography>
                      </Stack>
                    </Stack>
                  </Paper>

                  <Alert severity="info" icon={<Icon path={ICONS.info} size={18} color="#0284c7" />}>
                    For security, the verification OTP will be sent to your payout phone: {maskedPayoutPhone}
                  </Alert>

                  <Button
                    variant="contained"
                    fullWidth
                    disabled={loading || !minAmountOk || !maxAmountOk || !previewAllowed}
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
                    {loading ? 'Requesting…' : 'Request Withdrawal'}
                  </Button>
                </>
              ) : (
                <>
                  <Alert severity="info" icon={<Icon path={ICONS.info} size={18} color="#0284c7" />}>
                    Enter the OTP sent to {verificationContact || maskedPayoutPhone}
                  </Alert>

                  <TextField
                    label="OTP"
                    size="small"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="6-digit OTP"
                  />

                  <Button
                    variant="contained"
                    fullWidth
                    disabled={loading || otpExpired || !/^\d{6}$/.test(String(otp ?? ''))}
                    onClick={onVerifyOtp}
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
                    {loading ? 'Verifying…' : 'Verify OTP'}
                  </Button>

                  <Button
                    variant="outlined"
                    fullWidth
                    disabled={loading}
                    onClick={() => {
                      setStep('form');
                      setOtp('');
                      setWithdrawalId(null);
                      setVerificationContact('');
                      setOtpExpiresAt(null);
                      setError('');
                    }}
                    sx={{ textTransform: 'none', borderRadius: 1 }}
                  >
                    Back
                  </Button>
                </>
              )}
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
                  <TableCell>Reference</TableCell>
                  <TableCell>Total</TableCell>
                  <TableCell>Net</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Requested</TableCell>
                  <TableCell>Completed</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {listLoading ? (
                  <TableRow hover>
                    <TableCell colSpan={7} sx={{ py: 3 }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        Loading withdrawals…
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : listError ? (
                  <TableRow hover>
                    <TableCell colSpan={7} sx={{ py: 3 }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        {listError}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow hover>
                    <TableCell colSpan={7} sx={{ py: 3 }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                        No withdrawals yet
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((w) => (
                    <TableRow key={w.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 900 }}>
                        {w.reference}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>UGX {formatMoney(w.total_amount)}</TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>UGX {formatMoney(w.net_amount)}</TableCell>
                      <TableCell>
                        <StatusPill status={w.status} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Box component="span" sx={{ display: 'block', fontWeight: 900 }}>
                          {formatDateOnly(w.requested_at)}
                        </Box>
                        <Box component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                          {formatTimeOnly(w.requested_at)}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {w.completed_at ? (
                          <>
                            <Box component="span" sx={{ display: 'block', fontWeight: 900 }}>
                              {formatDateOnly(w.completed_at)}
                            </Box>
                            <Box component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                              {formatTimeOnly(w.completed_at)}
                            </Box>
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setSelectedId(w.id);
                            setDetailsOpen(true);
                          }}
                          sx={{ textTransform: 'none', borderRadius: 1 }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {total > 0 && !listLoading && !listError ? (
            <>
              <Divider sx={{ borderColor: '#eef2f7' }} />

              <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                  Page {page} of {pageCount}
                </Typography>

                <Stack direction="row" spacing={1} alignItems="center">
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    sx={{ textTransform: 'none', borderRadius: 1 }}
                  >
                    Prev
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={page >= pageCount}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    sx={{ textTransform: 'none', borderRadius: 1, bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
                  >
                    Next
                  </Button>
                </Stack>
              </Box>
            </>
          ) : null}
        </Paper>
      </Box>

      <WithdrawalDetailsModal
        open={detailsOpen}
        withdrawalId={selectedId}
        onClose={() => {
          setDetailsOpen(false);
          setSelectedId(null);
        }}
      />

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

