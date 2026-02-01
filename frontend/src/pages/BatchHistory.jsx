import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
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
import { getVoucherBatches } from '../services/batches';

function extractBackendError(err) {
  const data = err?.response?.data;
  const code = data?.error?.code ?? 'REQUEST_FAILED';
  const message =
    data?.error?.message ??
    err?.message ??
    (err?.code ? `Request failed (${err.code})` : 'Request failed');
  return { code, message };
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export default function BatchHistory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await getVoucherBatches();
        const payload = res.data;
        const data = Array.isArray(payload?.data) ? payload.data : [];
        if (cancelled) return;
        setRows(data);
      } catch (err) {
        if (cancelled) return;
        setError(extractBackendError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Paper elevation={2} sx={{ width: '100%', maxWidth: 1100, p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="h5" fontWeight={800}>
                Batch History
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Uploaded voucher batches.
              </Typography>
            </Box>

            {error ? (
              <Alert severity="error">
                <Typography variant="body2" fontWeight={700}>
                  {error.code}
                </Typography>
                <Typography variant="body2">{error.message}</Typography>
              </Alert>
            ) : null}

            <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <Table size="small" sx={{ minWidth: { xs: 760, md: 0 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Filename</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Package</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <CircularProgress size={18} />
                          <Typography variant="body2">Loading…</Typography>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography variant="body2" color="text.secondary">
                          No batches found.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.id} hover>
                        <TableCell>{r.id}</TableCell>
                        <TableCell sx={{ maxWidth: { xs: 180, sm: 280 }, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.filename}
                        </TableCell>
                        <TableCell sx={{ maxWidth: { xs: 220, sm: 360 }, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.description ?? ''}
                        </TableCell>
                        <TableCell>{r.package_name}</TableCell>
                        <TableCell align="right">{r.total_vouchers ?? 0}</TableCell>
                        <TableCell>{formatDate(r.created_at)}</TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => {
                              const id = encodeURIComponent(String(r.id));
                              window.location.assign(`/admin/vouchers?batch_id=${id}`);
                            }}
                            sx={{ minHeight: 44, px: 1.5, textTransform: 'none', borderRadius: 1 }}
                          >
                            View Vouchers
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </Paper>
      </Box>
    </Container>
  );
}
