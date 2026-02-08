import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

import { fetchWithdrawalDetails } from '../api/withdrawals';

function formatCurrencyUGX(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  return `${n.toLocaleString()} UGX`;
}

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusPill({ status }) {
  const s = String(status ?? '').toLowerCase();
  const isCompleted = s === 'completed';
  const isPending = s === 'pending' || s === 'approved';
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

function Field({ label, value, mono = false, right = null }) {
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 900, letterSpacing: 0.4 }}>
          {label}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {right}
      </Stack>
      <Typography
        variant="body2"
        sx={{ mt: 0.25, fontWeight: 800, fontFamily: mono ? 'monospace' : 'inherit' }}
      >
        {value ?? '—'}
      </Typography>
    </Box>
  );
}

export default function WithdrawalDetailsModal({ open, withdrawalId, onClose }) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState(null);

  const title = useMemo(() => {
    if (!withdrawalId) return 'Withdrawal Details';
    return `Withdrawal #${withdrawalId}`;
  }, [withdrawalId]);

  useEffect(() => {
    if (!open || !withdrawalId) {
      setDetails(null);
      setError('');
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetchWithdrawalDetails(withdrawalId);
        if (!cancelled) setDetails(res ?? null);
      } catch (e) {
        if (!cancelled) {
          setDetails(null);
          setError(e?.response?.data?.error?.message ?? e?.message ?? 'Failed to load withdrawal');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, withdrawalId]);

  const w = details?.withdrawal ?? null;
  const transactions = Array.isArray(details?.transactions) ? details.transactions : [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isPhone}>
      <DialogTitle sx={{ fontWeight: 900 }}>{title}</DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2, pb: 2 }}>
        {loading ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            Loading…
          </Typography>
        ) : error ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            {error}
          </Typography>
        ) : !w ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            No withdrawal selected.
          </Typography>
        ) : (
          <Stack spacing={2}>
            <Field
              label="Reference"
              value={w.reference}
              mono
              right={
                <Button
                  size="small"
                  variant="outlined"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(String(w.reference ?? ''));
                    } catch {
                      // ignore
                    }
                  }}
                  sx={{ textTransform: 'none', borderRadius: 1 }}
                >
                  Copy
                </Button>
              }
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Field label="Total" value={formatCurrencyUGX(w.total_amount)} />
              <Field label="Net" value={formatCurrencyUGX(w.net_amount)} />
            </Stack>

            <Field label="Status" value={w.status} right={<StatusPill status={w.status} />} />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Field label="Requested" value={formatDateTime(w.requested_at)} />
              <Field label="Completed" value={w.completed_at ? formatDateTime(w.completed_at) : '—'} />
            </Stack>

            <Field label="Payout Method" value={w.payout_method} />
            <Field label="Payout Account" value={w.payout_account} mono />

            <Divider />

            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
              Linked Transactions ({transactions.length})
            </Typography>

            <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <Table
                size="small"
                sx={{
                  minWidth: { xs: 820, md: 0 },
                  '& th': {
                    bgcolor: (t) => (t.palette.mode === 'dark' ? alpha(t.palette.common.white, 0.04) : '#f8fafc'),
                    fontWeight: 900,
                  },
                  '& td': { py: 1 },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Net</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Bundle</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow hover>
                      <TableCell colSpan={7} sx={{ py: 2.5 }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                          No linked transactions.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((t) => (
                      <TableRow key={t.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(t.created_at)}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', color: 'primary.main', fontWeight: 900 }}>
                          {t.reference}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{t.customer_phone ?? '—'}</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>{formatCurrencyUGX(t.amount_ugx)}</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>{formatCurrencyUGX(t.net_amount_ugx)}</TableCell>
                        <TableCell>{t.status ?? '—'}</TableCell>
                        <TableCell>{t.bundle_name ?? '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        )}
      </DialogContent>
      <Divider />
      <DialogActions sx={{ px: 3, py: 2, gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Button
          onClick={onClose}
          variant="contained"
          fullWidth={isPhone}
          sx={{ textTransform: 'none', borderRadius: 1, fontWeight: 900, minHeight: 44 }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
