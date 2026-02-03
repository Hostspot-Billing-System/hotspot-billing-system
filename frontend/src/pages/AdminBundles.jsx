import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

import { api } from '../services/api';
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

function formatDurationBadge(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1440) return `${Math.round((n / 1440) * 10) / 10} day(s)`;
  if (n >= 60) return `${Math.round((n / 60) * 10) / 10} hour(s)`;
  return `${n} min(s)`;
}

function formatUGX(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString()} UGX`;
}

async function fetchVoucherCountsForPackage(packageId, { signal } = {}) {
  const [totalRes, availRes] = await Promise.all([
    api.get('/api/vouchers', { params: { package_id: packageId }, signal }),
    api.get('/api/vouchers', { params: { package_id: packageId, status: 'available' }, signal }),
  ]);

  const total = Array.isArray(totalRes?.data?.data) ? totalRes.data.data.length : 0;
  const available = Array.isArray(availRes?.data?.data) ? availRes.data.data.length : 0;
  return { total, available };
}

export default function AdminBundles() {
  const theme = useTheme();
  // Always use card layout to avoid table clipping/hidden actions on mid-size laptops.
  // (The right panel is narrower due to the admin sidebar and left form column.)
  const useCardLayout = true;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [voucherCounts, setVoucherCounts] = useState({});
  const [countsLoading, setCountsLoading] = useState(false);

  const [draftSearch, setDraftSearch] = useState('');
  const [draftStatus, setDraftStatus] = useState('all');
  const [filters, setFilters] = useState({ q: '', status: 'all' });

  const [form, setForm] = useState({ name: '', duration: '', price: '', description: '' });
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'info' });

  const abortRef = useRef(null);

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

  useEffect(() => {
    if (!rows.length) return;

    try {
      abortRef.current?.abort?.();
    } catch {
      // ignore
    }
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    (async () => {
      setCountsLoading(true);
      try {
        const pairs = await Promise.all(
          rows.map(async (r) => {
            const id = Number(r?.id);
            if (!Number.isFinite(id) || id <= 0) return [null, null];
            const counts = await fetchVoucherCountsForPackage(id, { signal: controller.signal });
            return [id, counts];
          })
        );

        if (cancelled) return;
        const next = {};
        for (const [id, counts] of pairs) {
          if (id && counts) next[id] = counts;
        }
        setVoucherCounts(next);
      } catch (err) {
        if (cancelled) return;
        // If vouchers endpoint fails, keep UI stable.
        setVoucherCounts({});
      } finally {
        if (!cancelled) setCountsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      try {
        controller.abort();
      } catch {
        // ignore
      }
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = String(filters.q ?? '').trim().toLowerCase();
    const status = String(filters.status ?? 'all');
    return rows.filter((r) => {
      const isActive = Boolean(r?.is_active ?? true);
      if (status === 'active' && !isActive) return false;
      if (status === 'disabled' && isActive) return false;
      if (!q) return true;

      const hay = `${r?.id ?? ''} ${r?.name ?? ''} ${r?.mikrotik_profile ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filters]);

  const bundlesFoundLabel = `${filteredRows.length} bundle(s) found`;

  return (
    <Box sx={{ width: '100%', pt: 1, pb: 4 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 900, mb: 0.5 }}>
          Manage Bundles
        </Typography>
      </Box>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight={800}>
            {error.code}
          </Typography>
          <Typography variant="body2">{error.message}</Typography>
        </Alert>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '520px 1fr' },
          gap: 2,
          alignItems: 'start',
        }}
      >
        {/* Left: Create */}
        <Paper elevation={0} sx={{ borderRadius: 2, border: 1, borderColor: 'divider', p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 900, mb: 2 }}>
            Create New Bundle
          </Typography>

          <Stack spacing={1.75}>
            <TextField
              label="Bundle Name"
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              fullWidth
              size="small"
            />

            <Box>
              <TextField
                label="Duration (minutes)"
                value={form.duration}
                onChange={(e) => setForm((s) => ({ ...s, duration: e.target.value }))}
                fullWidth
                size="small"
              />
              <Typography variant="caption" sx={{ display: 'block', mt: 0.6, color: 'text.secondary' }}>
                Example: 60 for 1 hour, 1440 for 1 day, 10080 for 1 week
              </Typography>
            </Box>

            <TextField
              label="Price (UGX)"
              value={form.price}
              onChange={(e) => setForm((s) => ({ ...s, price: e.target.value }))}
              fullWidth
              size="small"
            />

            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              fullWidth
              size="small"
              multiline
              minRows={4}
            />

            <Button
              variant="contained"
              fullWidth
              sx={{
                mt: 1,
                py: 1.25,
                fontWeight: 800,
                borderRadius: 1.5,
                textTransform: 'none',
              }}
              onClick={() =>
                setSnack({
                  open: true,
                  message: 'Create bundle is not available yet (backend endpoint not implemented).',
                  severity: 'info',
                })
              }
            >
              Create Bundle
            </Button>
          </Stack>
        </Paper>

        {/* Right: List */}
        <Paper elevation={0} sx={{ borderRadius: 2, border: 1, borderColor: 'divider', p: 2.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              Your Bundles
            </Typography>
            <Chip
              label={loading ? 'Loading…' : bundlesFoundLabel}
              size="small"
              sx={{
                bgcolor: '#0ea5e9',
                color: 'white',
                fontWeight: 800,
              }}
            />
          </Stack>

          <Paper
            elevation={0}
            sx={{
              borderRadius: 2,
              border: 1,
              borderColor: 'divider',
              p: 2,
              mb: 2,
            }}
          >
            <Stack
              direction={{ xs: 'column', xl: 'row' }}
              spacing={1.25}
              alignItems={{ xs: 'stretch', md: 'center' }}
            >
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 900, color: 'text.secondary' }}>
                  Search Bundles
                </Typography>
                <TextField
                  value={draftSearch}
                  onChange={(e) => setDraftSearch(e.target.value)}
                  placeholder="Search by name, description, ID…"
                  fullWidth
                  size="small"
                />
              </Box>

              <Box sx={{ width: { xs: '100%', md: 220 } }}>
                <Typography variant="caption" sx={{ fontWeight: 900, color: 'text.secondary' }}>
                  Status Filter
                </Typography>
                <FormControl fullWidth size="small">
                  <InputLabel id="bundle-status-label">All Statuses</InputLabel>
                  <Select
                    labelId="bundle-status-label"
                    label="All Statuses"
                    value={draftStatus}
                    onChange={(e) => setDraftStatus(e.target.value)}
                  >
                    <MenuItem value="all">All Statuses</MenuItem>
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="disabled">Disabled</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Stack direction="row" spacing={1} sx={{ pt: { xs: 0.5, xl: 2.3 } }}>
                <Button
                  variant="contained"
                  onClick={() => setFilters({ q: draftSearch, status: draftStatus })}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 900,
                    borderRadius: 1.5,
                    minWidth: 110,
                  }}
                >
                  Search
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => {
                    setDraftSearch('');
                    setDraftStatus('all');
                    setFilters({ q: '', status: 'all' });
                  }}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 900,
                    borderRadius: 1.5,
                    minWidth: 110,
                  }}
                >
                  Reset
                </Button>
              </Stack>
            </Stack>
          </Paper>

          <Divider sx={{ mb: 1.5 }} />

          {useCardLayout ? (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                gap: 1.25,
              }}
            >
              {loading ? (
                <Paper elevation={0} sx={{ borderRadius: 2, border: 1, borderColor: 'divider', p: 2, gridColumn: '1 / -1' }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <CircularProgress size={18} />
                    <Typography variant="body2">Loading…</Typography>
                  </Stack>
                </Paper>
              ) : filteredRows.length === 0 ? (
                <Paper elevation={0} sx={{ borderRadius: 2, border: 1, borderColor: 'divider', p: 2, gridColumn: '1 / -1' }}>
                  <Typography variant="body2" color="text.secondary">
                    No bundles found.
                  </Typography>
                </Paper>
              ) : (
                filteredRows.map((r) => {
                  const isActive = Boolean(r?.is_active ?? true);
                  const counts = voucherCounts?.[r.id] ?? null;
                  const vouchersLabel = counts ? `${counts.available} / ${counts.total}` : '— / —';
                  return (
                    <Paper key={r.id} elevation={0} sx={{ borderRadius: 2, border: 1, borderColor: 'divider', p: 2 }}>
                      <Stack spacing={1.25}>
                        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body1" sx={{ fontWeight: 900, lineHeight: 1.15 }} noWrap>
                              {r.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              ID: {r.id} • {r.mikrotik_profile ?? '—'}
                            </Typography>
                          </Box>
                          <Chip
                            label={isActive ? 'Active' : 'Disabled'}
                            size="small"
                            sx={{
                              bgcolor: isActive ? '#16a34a' : '#64748b',
                              color: 'white',
                              fontWeight: 900,
                              flexShrink: 0,
                            }}
                          />
                        </Stack>

                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          <Chip
                            label={formatDurationBadge(r.duration_minutes)}
                            size="small"
                            sx={{ bgcolor: '#06b6d4', color: 'white', fontWeight: 900 }}
                          />
                          <Chip
                            label={formatUGX(r.price_ugx)}
                            size="small"
                            sx={{ bgcolor: '#0f172a', color: 'white', fontWeight: 900 }}
                          />
                          <Chip
                            label={`Vouchers ${vouchersLabel}`}
                            size="small"
                            sx={{ bgcolor: '#2563eb', color: 'white', fontWeight: 900 }}
                          />
                        </Stack>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pt: 0.25 }}>
                          <Button
                            fullWidth
                            variant="outlined"
                            size="small"
                            sx={{ textTransform: 'none', fontWeight: 900, borderRadius: 1.25 }}
                            onClick={() =>
                              setSnack({
                                open: true,
                                message: 'Edit bundle is not available yet (backend endpoint not implemented).',
                                severity: 'info',
                              })
                            }
                          >
                            Edit
                          </Button>
                          <Button
                            fullWidth
                            variant="outlined"
                            size="small"
                            sx={{ textTransform: 'none', fontWeight: 900, borderRadius: 1.25 }}
                            onClick={() =>
                              setSnack({
                                open: true,
                                message: 'Enable/Disable bundle is not available yet (backend endpoint not implemented).',
                                severity: 'info',
                              })
                            }
                          >
                            {isActive ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            fullWidth
                            variant="outlined"
                            size="small"
                            color="error"
                            sx={{ textTransform: 'none', fontWeight: 900, borderRadius: 1.25 }}
                            onClick={() =>
                              setSnack({
                                open: true,
                                message: 'Delete bundle is not available yet (backend endpoint not implemented).',
                                severity: 'info',
                              })
                            }
                          >
                            Delete
                          </Button>
                        </Stack>

                        {countsLoading && !counts ? (
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Updating voucher counts…
                          </Typography>
                        ) : null}
                      </Stack>
                    </Paper>
                  );
                })
              )}
            </Box>
          ) : null}
        </Paper>
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={3500}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        message={snack.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
