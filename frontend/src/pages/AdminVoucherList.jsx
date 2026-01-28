import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import { getPackages } from '../services/packages';
import { getVoucherBatches } from '../services/voucherBatches';
import { listVouchers } from '../services/vouchers';

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

function statusChip(status) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'available') return <Chip size="small" color="success" label="Available" />;
  if (s === 'used') return <Chip size="small" color="warning" label="Used" />;
  if (s === 'expired') return <Chip size="small" color="error" label="Expired" />;
  return <Chip size="small" label={status ?? ''} />;
}

export default function AdminVoucherList({ initialFilters }) {
  const [packages, setPackages] = useState([]);
  const [batches, setBatches] = useState([]);

  const [status, setStatus] = useState('');
  const [packageId, setPackageId] = useState('');
  const [batchId, setBatchId] = useState('');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);

  const apiPage = useMemo(() => page + 1, [page]);

  useEffect(() => {
    if (!initialFilters) return;
    if (initialFilters.status != null) setStatus(String(initialFilters.status));
    if (initialFilters.package_id != null) setPackageId(String(initialFilters.package_id));
    if (initialFilters.batch_id != null) setBatchId(String(initialFilters.batch_id));
    setPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFilters]);

  useEffect(() => {
    let cancelled = false;

    async function loadFilterData() {
      try {
        const [pkgRes, batchRes] = await Promise.all([
          getPackages(),
          getVoucherBatches({ page: 1, limit: 200 }),
        ]);

        if (cancelled) return;
        setPackages(Array.isArray(pkgRes.data) ? pkgRes.data : []);
        setBatches(Array.isArray(batchRes.data?.data) ? batchRes.data.data : []);
      } catch (err) {
        if (cancelled) return;
        // Filters are optional; keep page usable even if these fail.
        // eslint-disable-next-line no-console
        console.debug('[AdminVoucherList] filter data error', err);
      }
    }

    loadFilterData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await listVouchers({
          page: apiPage,
          limit: rowsPerPage,
          status: status || undefined,
          package_id: packageId || undefined,
          batch_id: batchId || undefined,
        });

        if (cancelled) return;
        const data = res.data;
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
  }, [apiPage, rowsPerPage, status, packageId, batchId]);

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Paper elevation={2} sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Vouchers
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Browse vouchers with filters.
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <FormControl sx={{ minWidth: 180 }} size="small">
              <InputLabel id="status-label">Status</InputLabel>
              <Select
                labelId="status-label"
                label="Status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="available">Available</MenuItem>
                <MenuItem value="used">Used</MenuItem>
                <MenuItem value="expired">Expired</MenuItem>
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 220 }} size="small">
              <InputLabel id="package-label">Package</InputLabel>
              <Select
                labelId="package-label"
                label="Package"
                value={packageId}
                onChange={(e) => {
                  setPackageId(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">All</MenuItem>
                {packages.map((p) => (
                  <MenuItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 240 }} size="small">
              <InputLabel id="batch-label">Batch</InputLabel>
              <Select
                labelId="batch-label"
                label="Batch"
                value={batchId}
                onChange={(e) => {
                  setBatchId(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">All</MenuItem>
                {batches.map((b) => (
                  <MenuItem key={b.id} value={String(b.id)}>
                    #{b.id} — {b.filename}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

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
                  <TableCell>Code</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Package</TableCell>
                  <TableCell>Batch</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Used At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <CircularProgress size={18} />
                        <Typography variant="body2">Loading…</Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary">
                        No vouchers found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                        {r.code}
                      </TableCell>
                      <TableCell>{statusChip(r.status)}</TableCell>
                      <TableCell>{r.package_name}</TableCell>
                      <TableCell>{r.batch_id ?? ''}</TableCell>
                      <TableCell>{formatDate(r.created_at)}</TableCell>
                      <TableCell>{formatDate(r.used_at)}</TableCell>
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
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </Stack>
      </Paper>
    </Container>
  );
}
