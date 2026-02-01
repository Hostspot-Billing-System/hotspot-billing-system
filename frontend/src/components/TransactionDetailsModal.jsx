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
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

import { fetchTransactionById } from '../services/transactions';

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
  const isCompleted = s === 'completed' || s === 'success' || s === 'paid';
  const isFailed = s === 'failed' || s === 'error';

  return (
    <Chip
      size="small"
      label={status ?? '—'}
      sx={{
        height: 20,
        fontWeight: 900,
        fontSize: 11,
        borderRadius: 999,
        bgcolor: isCompleted ? '#15803d' : isFailed ? '#ef4444' : '#64748b',
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

export default function TransactionDetailsModal({ open, transactionId, onClose }) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tx, setTx] = useState(null);

  const title = useMemo(() => {
    if (!transactionId) return 'Transaction Details';
    return `Transaction #${transactionId}`;
  }, [transactionId]);

  useEffect(() => {
    if (!open || !transactionId) {
      setTx(null);
      setError('');
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetchTransactionById(transactionId);
        const row = res?.data ?? null;
        if (!cancelled) setTx(row);
      } catch (e) {
        if (!cancelled) {
          setTx(null);
          setError(e?.response?.data?.error?.message ?? e?.message ?? 'Failed to load transaction');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, transactionId]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={isPhone}>
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
        ) : !tx ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
            No transaction selected.
          </Typography>
        ) : (
          <Stack spacing={2}>
            <Field
              label="Reference"
              value={tx.reference}
              mono
              right={
                <Button
                  size="small"
                  variant="outlined"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(String(tx.reference ?? ''));
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

            <Field label="Bundle" value={tx.bundle_name ?? tx.bundle_id} />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Field label="Amount" value={formatCurrencyUGX(tx.amount_ugx)} />
              <Field label="Commission" value={formatCurrencyUGX(tx.commission_ugx)} />
            </Stack>

            <Field label="Status" value={tx.status} right={<StatusPill status={tx.status} />} />

            <Field label="Phone" value={tx.customer_phone} mono />
            <Field label="Date" value={formatDateTime(tx.created_at)} />
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
