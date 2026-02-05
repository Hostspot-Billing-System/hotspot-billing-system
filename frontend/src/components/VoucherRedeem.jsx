import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { redeemVoucher } from '../services/vouchers';

function extractBackendError(err) {
  const data = err?.response?.data;
  const code = data?.error?.code ?? 'REQUEST_FAILED';
  const message =
    data?.error?.message ??
    err?.message ??
    (err?.code ? `Request failed (${err.code})` : 'Request failed');
  return { code, message };
}

export default function VoucherRedeem() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [error, setError] = useState(null);

  const canRedeem = useMemo(() => {
    return Boolean(code.trim()) && !loading;
  }, [code, loading]);

  async function onRedeem() {
    setLoading(true);
    setError(null);
    setSuccessData(null);

    try {
      const data = await redeemVoucher({ code });
      setSuccessData(data?.data ?? null);
    } catch (err) {
      setError(extractBackendError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Redeem Voucher
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enter a voucher code to redeem it.
          </Typography>
        </Box>

        <TextField
          label="Voucher Code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. ABC123"
          fullWidth
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canRedeem) onRedeem();
          }}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="contained" onClick={onRedeem} disabled={!canRedeem}>
            Redeem
          </Button>
          {loading ? <CircularProgress size={22} /> : null}
        </Box>

        {successData ? (
          <Alert severity="success">
            Redeemed successfully. Package: {successData.package_name}. Redeemed at:{' '}
            {successData.used_at ? new Date(successData.used_at).toLocaleString() : '—'}
          </Alert>
        ) : null}

        {error ? (
          <Alert severity="error">
            {error.message}
          </Alert>
        ) : null}
      </Stack>
    </Box>
  );
}
