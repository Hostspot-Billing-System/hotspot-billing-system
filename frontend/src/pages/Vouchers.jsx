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
  TableRow,
  Typography,
} from '@mui/material';
import { getPackages } from '../services/packages';
import { getVoucherBatches } from '../services/batches';
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

function formatDateMultiline(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return (
    <span>
      {d.toLocaleDateString()}
      <br />
      {d.toLocaleTimeString()}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = String(status ?? '').toLowerCase();

  if (s === 'available') {
    return <Chip size="small" label="Available" sx={{ bgcolor: 'success.main', color: 'common.white' }} />;
  }

  if (s === 'used') {
    return <Chip size="small" label="Used" sx={{ bgcolor: 'grey.500', color: 'common.white' }} />;
  }

  if (s === 'expired') {
    return <Chip size="small" label="Expired" sx={{ bgcolor: 'error.main', color: 'common.white' }} />;
  }

  return <Chip size="small" label={status ?? ''} />;
}

function readFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    status: params.get('status') ?? '',
    package_id: params.get('package_id') ?? '',
    batch_id: params.get('batch_id') ?? '',
  };
}

function writeFiltersToUrl({ status, package_id, batch_id }) {
  const params = new URLSearchParams(window.location.search);

  if (status) params.set('status', status);
  else params.delete('status');

  if (package_id) params.set('package_id', package_id);
  else params.delete('package_id');

  if (batch_id) params.set('batch_id', batch_id);
  else params.delete('batch_id');

  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
  window.history.replaceState({}, '', next);
}

export default function Vouchers() {
  const initial = useMemo(() => readFiltersFromUrl(), []);

  const [status, setStatus] = useState(initial.status);
  const [packageId, setPackageId] = useState(initial.package_id);
  const [batchId, setBatchId] = useState(initial.batch_id);

  const [packages, setPackages] = useState([]);
  const [batches, setBatches] = useState([]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Keep state in sync with back/forward navigation.
  useEffect(() => {
    function onPop() {
      const f = readFiltersFromUrl();
      setStatus(f.status);
      setPackageId(f.package_id);
      setBatchId(f.batch_id);
    }

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Load dropdown options.
  useEffect(() => {
    let cancelled = false;

    async function loadFilters() {
      try {
        const [pkgRes, batchRes] = await Promise.all([getPackages(), getVoucherBatches()]);
        if (cancelled) return;

        setPackages(Array.isArray(pkgRes.data) ? pkgRes.data : []);

        const batchPayload = batchRes.data;
        const batchRows = Array.isArray(batchPayload?.data) ? batchPayload.data : [];
        setBatches(batchRows);
      } catch (err) {
        // Filters are optional; keep the page usable even if dropdown data fails.
        // eslint-disable-next-line no-console
        console.debug('[Vouchers] failed to load filter data', err);
      }
    }

    loadFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reflect filters into query params.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    writeFiltersToUrl({
      status,
      package_id: packageId,
      batch_id: batchId,
    });
  }, [status, packageId, batchId]);

  // Fetch vouchers when filters change.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await listVouchers({
          status: status || undefined,
          package_id: packageId || undefined,
          batch_id: batchId || undefined,
        });

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
  }, [status, packageId, batchId]);

  const batchLabelById = useMemo(() => {
    const map = new Map();
    for (const b of batches) {
      map.set(String(b.id), `#${b.id} — ${b.filename}`);
    }
    return map;
  }, [batches]);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 4 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Paper elevation={2} sx={{ width: '100%', maxWidth: 1200, p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="h5" fontWeight={800}>
                Vouchers
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Filter and browse vouchers.
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl sx={{ minWidth: { xs: '100%', md: 180 } }} size="small" fullWidth>
                <InputLabel id="status-label">Status</InputLabel>
                <Select
                  labelId="status-label"
                  label="Status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="available">Available</MenuItem>
                  <MenuItem value="used">Used</MenuItem>
                  <MenuItem value="expired">Expired</MenuItem>
                </Select>
              </FormControl>

              <FormControl sx={{ minWidth: { xs: '100%', md: 220 } }} size="small" fullWidth>
                <InputLabel id="package-label">Package</InputLabel>
                <Select
                  labelId="package-label"
                  label="Package"
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  {packages.map((p) => (
                    <MenuItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl sx={{ minWidth: { xs: '100%', md: 260 } }} size="small" fullWidth>
                <InputLabel id="batch-label">Batch</InputLabel>
                <Select
                  labelId="batch-label"
                  label="Batch"
                  value={batchId}
                  onChange={(e) => setBatchId(e.target.value)}
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

            <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <Table size="small" sx={{ minWidth: { xs: 820, md: 0 } }}>
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
                      <TableRow key={r.code} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          {r.code}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell>{r.package_name}</TableCell>
                        <TableCell>{r.batch_id ? batchLabelById.get(String(r.batch_id)) ?? `#${r.batch_id}` : ''}</TableCell>
                        <TableCell>{formatDateMultiline(r.created_at)}</TableCell>
                        <TableCell>{formatDate(r.used_at)}</TableCell>
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
