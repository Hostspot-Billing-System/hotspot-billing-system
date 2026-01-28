import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { getVoucherBatches } from '../services/voucherBatches';

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function extractBackendError(err) {
  const data = err?.response?.data;
  const code = data?.error?.code ?? 'REQUEST_FAILED';
  const message =
    data?.error?.message ??
    err?.message ??
    (err?.code ? `Request failed (${err.code})` : 'Request failed');
  return { code, message };
}

export default function AdminBatchHistory({ onViewVouchers }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);

  const apiPage = useMemo(() => page + 1, [page]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getVoucherBatches({ page: apiPage, limit: rowsPerPage });
        const data = res.data;
        if (cancelled) return;
        setRows(Array.isArray(data?.data) ? data.data : []);
        setTotal(Number(data?.pagination?.total ?? 0));
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
  }, [apiPage, rowsPerPage]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Paper elevation={2} sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Batch History
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Uploaded CSV batches and voucher counts.
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

          <TableContainer>
            <Table size="small">
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
                      <TableCell sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.filename}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.description ? <Chip size="small" label={r.description} /> : ''}
                      </TableCell>
                      <TableCell>{r.package_name}</TableCell>
                      <TableCell align="right">{r.total_vouchers ?? 0}</TableCell>
                      <TableCell>{formatDate(r.created_at)}</TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => onViewVouchers?.(r)}
                        >
                          View vouchers
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setPage(0);
            }}
            rowsPerPageOptions={[5, 10, 25, 50]}
          />
        </Stack>
      </Paper>
    </Container>
  );
}
