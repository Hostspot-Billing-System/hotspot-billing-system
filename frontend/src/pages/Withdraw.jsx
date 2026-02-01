/*
 * DEV-ONLY: Manual smoke test checklist
 * 1. Enter amount < 500 → blocked
 * 2. Enter valid amount → preview updates
 * 3. Request withdrawal → OTP sent
 * 4. Enter wrong OTP → error
 * 5. Enter correct OTP → success
 * 6. Balance updates
 * 7. Withdrawal appears in history
 */

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
  const [otpExpiresAt, setOtpExpiresAt] = useState(null);
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

  const otpExpired = useMemo(() => {
    if (!otpExpiresAt) return false;
    const t = new Date(otpExpiresAt).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() > t;
  }, [otpExpiresAt]);

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

    if (parsedAmount > Number(balance ?? 0)) {
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
      const contact = data?.verification_contact ?? data?.verificationContact ?? maskContact(phone);
      const expiresAt = data?.otp_expires_at ?? null;

      setWithdrawalId(id);
      setVerificationContact(contact);
      setOtpExpiresAt(expiresAt);
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
      setOtpExpiresAt(null);

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

  useEffect(() => {
    if (step !== 'otp') return;
    if (!otpExpired) return;
    setError((prev) => prev || 'OTP expired. Please request a new OTP.');
  }, [step, otpExpired]);

  return (
    <Box sx={{ width: '100%', pt: 1, pb: 5 }}>
      <Typography variant="h4" fontWeight={400}>
        Withdraw
      </Typography>

      <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', fontWeight: 700 }}>
        Available balance: UGX {formatMoney(balance)}
      </Typography>

      <Paper elevation={0} sx={{ mt: 2, borderRadius: 2, border: '1px solid #e5e7eb', bgcolor: 'common.white' }}>
        <Stack spacing={2} sx={{ p: { xs: 2, sm: 3 } }}>
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
                fullWidth
              />

              <TextField
                label="Payout Phone"
                size="small"
                value={payoutPhone}
                onChange={(e) => setPayoutPhone(e.target.value)}
                placeholder="e.g. 2567xxxxxxxx"
                fullWidth
              />

              <Paper elevation={0} sx={{ borderRadius: 1.5, border: '1px solid #e5e7eb', bgcolor: 'common.white', p: 2 }}>
                <Stack spacing={1}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    sx={{ minWidth: 0, gap: { xs: 0.25, sm: 1 } }}
                  >
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                      Requested Amount
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 900, minWidth: 0, overflowWrap: 'anywhere' }}>
                      UGX {formatMoney(previewData?.requested_amount ?? parsedAmount ?? 0)}
                    </Typography>
                  </Stack>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    sx={{ minWidth: 0, gap: { xs: 0.25, sm: 1 } }}
                  >
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                      Transaction Fee
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 900, minWidth: 0, overflowWrap: 'anywhere' }}>
                      UGX {formatMoney(previewData?.withdrawal_fee ?? 0)}
                    </Typography>
                  </Stack>
                  <Divider sx={{ borderColor: '#eef2f7' }} />
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    sx={{ minWidth: 0, gap: { xs: 0.25, sm: 1 } }}
                  >
                    <Typography variant="body2" sx={{ color: '#15803d', fontWeight: 900 }}>
                      Net Amount (You will receive)
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 900, color: '#15803d', minWidth: 0, overflowWrap: 'anywhere' }}
                    >
                      UGX {formatMoney(previewData?.net_amount ?? 0)}
                    </Typography>
                  </Stack>
                </Stack>
              </Paper>

              <Button variant="contained" disabled={loading || !previewAllowed} onClick={onRequestWithdrawal} sx={{ minHeight: 44 }}>
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
                fullWidth
              />

              <Button
                variant="contained"
                onClick={onVerifyOtp}
                disabled={loading || otpExpired || !/^\d{6}$/.test(String(otp ?? ''))}
                sx={{ minHeight: 44 }}
              >
                {loading ? 'Verifying…' : 'Verify OTP'}
              </Button>

              <Button
                variant="outlined"
                onClick={() => {
                  setStep('form');
                  setOtp('');
                  setWithdrawalId(null);
                  setVerificationContact('');
                  setOtpExpiresAt(null);
                  setError('');
                }}
                disabled={loading}
              >
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
          <Stack spacing={1} sx={{ p: { xs: 2, sm: 3 }, minWidth: 0 }}>
            <Typography variant="h6" fontWeight={400}>
              Recent Withdrawals
            </Typography>
            {recentWithdrawals.map((w) => (
              <Stack
                key={w.id ?? w.reference ?? JSON.stringify(w)}
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                sx={{ minWidth: 0, gap: { xs: 0.25, sm: 1 } }}
              >
                <Typography variant="body2" sx={{ fontWeight: 800, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {w.reference ?? `#${w.id}`}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: 'text.secondary', fontWeight: 800, minWidth: 0, overflowWrap: 'anywhere' }}
                >
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
