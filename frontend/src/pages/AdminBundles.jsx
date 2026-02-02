import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
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

import { getPackagesFull } from '../services/packages';

function extractBackendError(err) {
  const data = err?.response?.data;
  const code = data?.error?.code ?? 'REQUEST_FAILED';
  const message =
    data?.error?.message ??
    err?.message ??
    (err?.code ? `Request failed (${err.code})` : 'Request failed');
  return { code, message };
}

function formatDuration(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n % 1440 === 0) return `${n / 1440} day(s)`;
  if (n % 60 === 0) return `${n / 60} hour(s)`;
  return `${n} min(s)`;
}

export default function AdminBundles() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getPackagesFull();
        if (cancelled) return;
        setRows(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        if (cancelled) return;
        setError(extractBackendError(err));
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    return {
      total: rows.length,
    };
  }, [rows]);

  return (
    <Box sx={{ width: '100%', pt: 1, pb: 4, px: 0 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, mb: 0.5 }}>
            Bundles
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {loading ? 'Loading bundles…' : `${summary.total} bundle(s)`}
          </Typography>
        </Box>

        {error ? (
          <Alert severity="error">
            <Typography variant="body2" fontWeight={800}>
              {error.code}
            </Typography>
            <Typography variant="body2">{error.message}</Typography>
          </Alert>
        ) : null}

        <Paper elevation={0} sx={{ borderRadius: 2, border: 1, borderColor: 'divider' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 900 }}>ID</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Duration</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>MikroTik Profile</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 1 }}>
                        <CircularProgress size={18} />
                        <Typography variant="body2">Loading…</Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        No bundles found.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell>{r.id}</TableCell>
                      <TableCell sx={{ fontWeight: 800 }}>{r.name}</TableCell>
                      <TableCell>{formatDuration(r.duration_minutes)}</TableCell>
                      <TableCell>{r.mikrotik_profile ?? '—'}</TableCell>
                      <TableCell>
                        {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>
    </Box>
  );
}
