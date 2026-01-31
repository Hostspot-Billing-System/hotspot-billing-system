import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Divider, Paper, Stack, TextField, Typography } from '@mui/material';

import { fetchWithdrawals, getWithdrawableBalance, previewWithdrawal, requestWithdrawal, verifyWithdrawal } from '../api/withdrawals';

function maskContact(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const keep = 4;
  return `******${s.slice(-keep)}`;
}

function formatMoney(value, decimals = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function Withdraw() {
  const [amount, setAmount] = useState('');
  const [payoutPhone, setPayoutPhone] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('form');
  const [withdrawalId, setWithdrawalId] = useState(null);
  const [otp, setOtp] = useState('');
  const [verificationContact, setVerificationContact] = useState('');
  const [success, setSuccess] = useState('');

  const [balance, setBalance] = useState(0);
  const [recentWithdrawals, setRecentWithdrawals] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

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
      try {
        const b = await getWithdrawableBalance();
        if (!cancelled) setBalance(Number(b ?? 0));
      } catch {
        if (!cancelled) setBalance(0);
      }

      try {
        const result = await fetchWithdrawals({ page: 1, perPage: 5 });
        if (!cancelled) setRecentWithdrawals(Array.isArray(result?.data) ? result.data : []);
      } catch {
        if (!cancelled) setRecentWithdrawals([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function onRequestWithdrawal() {
    // Required behavior: keep user on form step on error.
    setError('');
    setSuccess('');

    const phone = String(payoutPhone ?? '').trim();
    if (!phone) {
      setError('Enter a payout phone number.');
      return;
    }

    if (parsedAmount == null || parsedAmount <= 0) {
      setError('Enter a valid amount.');
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
      const contact = data?.verification_contact ?? data?.verificationContact ?? maskContact(phone);

      setWithdrawalId(id);
      setVerificationContact(contact);
      setStep('otp');
      setSuccess(`OTP sent to ${contact}`);
    } catch (e) {
      setError(e?.message ?? 'Failed to request withdrawal');
      setStep('form');
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp() {
    setError('');
    setSuccess('');

    const id = Number(withdrawalId);
    const otpValue = String(otp ?? '').trim();

    if (!Number.isFinite(id) || id <= 0) {
      setError('Missing withdrawal reference.');
      return;
    }

    if (!/^\d{6}$/.test(otpValue)) {
      setError('OTP must be 6 digits.');
      return;
    }

    setLoading(true);
    try {
      await verifyWithdrawal({ withdrawal_id: id, otp: otpValue });

      setSuccess('Withdrawal verified successfully.');

      // Reset form
      setAmount('');
      setPayoutPhone('');
      setPreviewData(null);
      setStep('form');
      setWithdrawalId(null);
      setOtp('');
      setVerificationContact('');

      // Refresh balances and recent withdrawals
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e?.message ?? 'Failed to verify OTP');
      // Keep user on OTP step so they can retry
      setStep('otp');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ width: '100%', pt: 1, pb: 5 }}>
      <Typography variant="h4" fontWeight={900}>
        Withdraw
      </Typography>

      <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', fontWeight: 700 }}>
        Available balance: UGX {formatMoney(balance)}
      </Typography>

      <Paper elevation={0} sx={{ mt: 2, borderRadius: 2, border: '1px solid #e5e7eb', bgcolor: 'common.white' }}>
        <Stack spacing={2} sx={{ p: 3 }}>
          {success ? <Alert severity="success">{success}</Alert> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}

          {step === 'form' ? (
            <>
              <TextField
                label="Amount"
                size="small"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1000"
              />

              <TextField
                label="Payout Phone"
                size="small"
                value={payoutPhone}
                onChange={(e) => setPayoutPhone(e.target.value)}
                placeholder="e.g. 2567xxxxxxxx"
              />

              <Paper elevation={0} sx={{ borderRadius: 1.5, border: '1px solid #e5e7eb', bgcolor: 'common.white', p: 2 }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                      Requested Amount
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 900 }}>
                      UGX {formatMoney(previewData?.requested_amount ?? parsedAmount ?? 0)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                      Transaction Fee
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 900 }}>
                      UGX {formatMoney(previewData?.withdrawal_fee ?? 0)}
                    </Typography>
                  </Stack>
                  <Divider sx={{ borderColor: '#eef2f7' }} />
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" sx={{ color: '#15803d', fontWeight: 900 }}>
                      Net Amount (You will receive)
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 900, color: '#15803d' }}>
                      UGX {formatMoney(previewData?.net_amount ?? 0)}
                    </Typography>
                  </Stack>
                </Stack>
              </Paper>

              <Button variant="contained" disabled={loading || !previewAllowed} onClick={onRequestWithdrawal}>
                {loading ? 'Requesting…' : 'Request Withdrawal'}
              </Button>
            </>
          ) : (
            <>
              <Alert severity="info">OTP sent to {verificationContact}</Alert>
              <TextField
                label="OTP"
                size="small"
                value={otp}
                onChange={(e) => {
                  const next = String(e.target.value ?? '')
                    .replace(/\D/g, '')
                    .slice(0, 6);
                  setOtp(next);
                }}
                placeholder="6-digit OTP"
                inputProps={{ inputMode: 'numeric', pattern: '\\d{6}', maxLength: 6 }}
              />

              <Button
                variant="contained"
                onClick={onVerifyOtp}
                disabled={loading || !/^\d{6}$/.test(String(otp ?? ''))}
              >
                {loading ? 'Verifying…' : 'Verify OTP'}
              </Button>

              <Button variant="outlined" onClick={() => setStep('form')} disabled={loading}>
                Back
              </Button>
            </>
          )}
        </Stack>
      </Paper>

      {recentWithdrawals.length ? (
        <Paper
          elevation={0}
          sx={{ mt: 2, borderRadius: 2, border: '1px solid #e5e7eb', bgcolor: 'common.white' }}
        >
          <Stack spacing={1} sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={900}>
              Recent Withdrawals
            </Typography>
            {recentWithdrawals.map((w) => (
              <Stack key={w.id ?? w.reference ?? JSON.stringify(w)} direction="row" justifyContent="space-between">
                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                  {w.reference ?? `#${w.id}`}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                  UGX {formatMoney(w.net_amount ?? w.total_amount ?? 0)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      ) : null}

      {withdrawalId ? (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.secondary' }}>
          Withdrawal ID: {withdrawalId}
        </Typography>
      ) : null}
    </Box>
  );
}
