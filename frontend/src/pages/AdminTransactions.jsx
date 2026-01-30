import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputAdornment,
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
  TextField,
  Typography,
} from '@mui/material';

import { getPackages } from '../services/packages';
import { exportTransactionsCSV, fetchTransactions } from '../api/transactions';
import TransactionDetailsModal from '../components/TransactionDetailsModal';

function Icon({ path, size = 18, color = 'currentColor' }) {
  return (
    <Box component="svg" viewBox="0 0 24 24" sx={{ width: size, height: size, display: 'block' }} aria-hidden>
      <path fill={color} d={path} />
    </Box>
  );
}

const ICONS = {
  search:
    'M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm11 3-6.2-6.2a10 10 0 1 0-2 2L19 23l2-2Z',
  calendar:
    'M7 2h2v2h6V2h2v2h3v18H2V4h5V2Zm13 8H4v10h16V10ZM4 8h16V6H4v2Z',
  export:
    'M5 20h14v-2H5v2Zm7-18v10l3-3 1.4 1.4L12 16.8 7.6 10.4 9 9l3 3V2h0Z',
  copy:
    'M16 1H6v6H4V1a2 2 0 0 1 2-2h10v2Zm4 6v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Zm-2 0H8v14h10V7Z',
  eye:
    'M12 5c5 0 9 7 9 7s-4 7-9 7-9-7-9-7 4-7 9-7Zm0 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  filter:
    'M4 5h16v2H4V5Zm3 6h10v2H7v-2Zm3 6h4v2h-4v-2Z',
};

function formatDateOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatTimeOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatCurrencyUGX(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  return `${n.toLocaleString()} UGX`;
}

function capitalize(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function StatusPill({ status }) {
  const s = String(status ?? '').toLowerCase();
  const isCompleted = s === 'completed' || s === 'success' || s === 'paid';
  const isFailed = s === 'failed' || s === 'error';
  const isPending = s === 'pending';

  return (
    <Chip
      size="small"
      label={status ?? '—'}
      sx={{
        height: 20,
        fontWeight: 900,
        fontSize: 11,
        borderRadius: 999,
        bgcolor: isCompleted ? '#15803d' : isFailed ? '#ef4444' : isPending ? '#f59e0b' : '#64748b',
        color: 'common.white',
        '& .MuiChip-label': { px: 1, py: 0 },
      }}
    />
  );
}

function downloadBlob({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminTransactions() {
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState('');
  const [bundle, setBundle] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [minAmount, setMinAmount] = useState('0');
  const [maxAmount, setMaxAmount] = useState('');
  const [perPage, setPerPage] = useState(20);
  const [page, setPage] = useState(1);

  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const [packages, setPackages] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await getPackages();
        const list = Array.isArray(response?.data) ? response.data : [];
        if (!cancelled) setPackages(list);
      } catch {
        if (!cancelled) setPackages([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const allBundles = useMemo(() => {
    return [...packages]
      .filter((p) => p && p.id != null)
      .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  }, [packages]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');

      try {
        const params = {
          status: status ? String(status).toLowerCase() : undefined,
          bundle: bundle || undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          search: searchQuery.trim() || undefined,
          page,
          perPage,
          minAmount: minAmount || undefined,
          maxAmount: maxAmount || undefined,
        };

        const result = await fetchTransactions(params);
        const list = Array.isArray(result?.data) ? result.data : [];

        if (!cancelled) {
          setRows(list);
          setTotal(Number(result?.meta?.total ?? 0));
          setPageCount(Math.max(1, Number(result?.meta?.totalPages ?? 1)));
        }
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          setPageCount(1);
          setError(e?.response?.data?.error?.message ?? e?.message ?? 'Failed to load transactions');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bundle, fromDate, maxAmount, minAmount, page, perPage, reloadKey, searchQuery, status, toDate]);

  const visible = useMemo(() => {
    return rows
      .map((r) => {
        return {
          id: r.id,
          created_at: r.created_at,
          reference: r.reference,
          customer: r.customer_phone ?? '',
          amount: r.amount_ugx,
          status: capitalize(r.status),
          bundle: r.bundle_name ?? '',
        };
      });
  }, [rows]);

  const showing = visible.length;

  return (
    <Box sx={{ width: '100%', pt: 1, pb: 5, px: 0 }}>
      <Typography variant="h4" sx={{ fontWeight: 900 }}>
        Transaction History
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
        Showing {showing} of {total.toLocaleString()} transactions
      </Typography>

      <Paper
        elevation={0}
        sx={{
          mt: 3,
          borderRadius: 2,
          border: '1px solid #e5e7eb',
          bgcolor: 'common.white',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.25,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: '#f8fafc',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <Icon path={ICONS.filter} size={16} color="#0f172a" />
          <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
            Search & Filter Transactions
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            variant="outlined"
            onClick={() => {
              setSearch('');
              setSearchQuery('');
              setStatus('');
              setBundle('');
              setFromDate('');
              setToDate('');
              setMinAmount('0');
              setMaxAmount('');
              setPerPage(20);
              setPage(1);
              setReloadKey((k) => k + 1);
            }}
            sx={{
              textTransform: 'none',
              borderRadius: 1,
              borderColor: '#cbd5e1',
              color: '#334155',
              bgcolor: 'common.white',
              '&:hover': { borderColor: '#94a3b8', bgcolor: 'common.white' },
            }}
          >
            Reset
          </Button>
        </Box>

        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                md: '2fr 1fr 1fr',
              },
            }}
          >
            <TextField
              size="small"
              label="Search"
              placeholder="Search by reference, phone, bundle, or vendor…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start" sx={{ ml: 0.5 }}>
                    <Icon path={ICONS.search} size={16} color="#64748b" />
                  </InputAdornment>
                ),
              }}
              sx={{ bgcolor: 'common.white' }}
            />

            <FormControl size="small" sx={{ bgcolor: 'common.white' }}>
              <InputLabel id="tx-status">Status</InputLabel>
              <Select
                labelId="tx-status"
                label="Status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="">All Status</MenuItem>
                <MenuItem value="Completed">Completed</MenuItem>
                <MenuItem value="Failed">Failed</MenuItem>
                <MenuItem value="Pending">Pending</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ bgcolor: 'common.white' }}>
              <InputLabel id="tx-bundle">Bundle</InputLabel>
              <Select
                labelId="tx-bundle"
                label="Bundle"
                value={bundle}
                onChange={(e) => {
                  setBundle(e.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="">All Bundles</MenuItem>
                {allBundles.map((b) => (
                  <MenuItem key={String(b.id)} value={String(b.name ?? '')}>
                    {b.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box
            sx={{
              mt: 2,
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                md: '1.2fr 1.2fr 0.8fr 0.8fr 0.8fr',
              },
              alignItems: 'end',
            }}
          >
            <TextField
              size="small"
              label="From Date"
              placeholder="mm/dd/yyyy"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Icon path={ICONS.calendar} size={16} color="#64748b" />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              size="small"
              label="To Date"
              placeholder="mm/dd/yyyy"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Icon path={ICONS.calendar} size={16} color="#64748b" />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              size="small"
              label="Min Amount (UGX)"
              value={minAmount}
              onChange={(e) => {
                setMinAmount(e.target.value);
                setPage(1);
              }}
              inputMode="numeric"
            />

            <TextField
              size="small"
              label="Max Amount (UGX)"
              placeholder="No limit"
              value={maxAmount}
              onChange={(e) => {
                setMaxAmount(e.target.value);
                setPage(1);
              }}
              inputMode="numeric"
            />

            <FormControl size="small">
              <InputLabel id="tx-per-page">Per Page</InputLabel>
              <Select
                labelId="tx-per-page"
                label="Per Page"
                value={String(perPage)}
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 50, 100].map((n) => (
                  <MenuItem key={n} value={String(n)}>
                    {n}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              variant="contained"
              onClick={() => {
                setSearchQuery(search);
                setPage(1);
                setReloadKey((k) => k + 1);
              }}
              startIcon={<Icon path={ICONS.search} size={16} color="#fff" />}
              sx={{
                textTransform: 'none',
                borderRadius: 1,
                fontWeight: 900,
                bgcolor: '#2563eb',
                '&:hover': { bgcolor: '#1d4ed8' },
              }}
            >
              Search
            </Button>

            <Box sx={{ flexGrow: 1 }} />

            <Button
              variant="outlined"
              disabled={exporting}
              onClick={async () => {
                try {
                  setExporting(true);
                  const params = {
                    status: status ? String(status).toLowerCase() : undefined,
                    bundle: bundle || undefined,
                    fromDate: fromDate || undefined,
                    toDate: toDate || undefined,
                    search: searchQuery.trim() || undefined,
                    minAmount: minAmount || undefined,
                    maxAmount: maxAmount || undefined,
                  };

                  await exportTransactionsCSV(params);
                } catch {
                  // ignore
                } finally {
                  setExporting(false);
                }
              }}
              startIcon={<Icon path={ICONS.export} size={16} color="#16a34a" />}
              sx={{
                textTransform: 'none',
                borderRadius: 1,
                borderColor: '#86efac',
                color: '#15803d',
                bgcolor: 'common.white',
                '&:hover': { borderColor: '#4ade80', bgcolor: 'common.white' },
              }}
            >
              Export CSV
              <Chip
                size="small"
                label={total.toLocaleString()}
                sx={{ ml: 1, height: 20, fontWeight: 900, bgcolor: '#e2e8f0', color: '#0f172a' }}
              />
            </Button>
          </Box>
        </Box>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          mt: 3,
          borderRadius: 2,
          border: '1px solid #e5e7eb',
          bgcolor: 'common.white',
          overflow: 'hidden',
        }}
      >
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table
            size="small"
            sx={{
              minWidth: 980,
              '& th': { bgcolor: '#f8fafc', fontWeight: 900 },
              '& td': { py: 1 },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell>Date & Time</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Bundle</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow hover>
                  <TableCell colSpan={7} sx={{ py: 3 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                      Loading transactions…
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow hover>
                  <TableCell colSpan={7} sx={{ py: 3 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                      {error}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : visible.length === 0 ? (
                <TableRow hover>
                  <TableCell colSpan={7} sx={{ py: 3 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                      No transactions found.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((t) => (
                  <TableRow key={t.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Box component="span" sx={{ display: 'block', fontWeight: 800 }}>
                      {formatDateOnly(t.created_at)}
                    </Box>
                    <Box component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                      {formatTimeOnly(t.created_at)}
                    </Box>
                  </TableCell>

                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          color: '#2563eb',
                          fontWeight: 900,
                        }}
                      >
                        {t.reference}
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(t.reference);
                          } catch {
                            // ignore
                          }
                        }}
                        sx={{
                          minWidth: 32,
                          px: 0,
                          borderRadius: 1,
                          borderColor: '#cbd5e1',
                          color: '#0f172a',
                          bgcolor: 'common.white',
                          '&:hover': { borderColor: '#94a3b8', bgcolor: 'common.white' },
                        }}
                      >
                        <Icon path={ICONS.copy} size={14} color="#0f172a" />
                      </Button>
                    </Stack>
                  </TableCell>

                  <TableCell sx={{ fontFamily: 'monospace' }}>{t.customer}</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>{formatCurrencyUGX(t.amount)}</TableCell>
                  <TableCell>
                    <StatusPill status={t.status} />
                  </TableCell>
                  <TableCell>{t.bundle}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setSelectedId(t.id);
                        setDetailsOpen(true);
                      }}
                      sx={{
                        minWidth: 34,
                        px: 0,
                        borderRadius: 1,
                        borderColor: '#93c5fd',
                        color: '#2563eb',
                        bgcolor: 'common.white',
                        '&:hover': { borderColor: '#60a5fa', bgcolor: 'common.white' },
                      }}
                    >
                      <Icon path={ICONS.eye} size={16} color="#2563eb" />
                    </Button>
                  </TableCell>
                </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {total > 0 && !loading && !error ? (
          <>
            <Divider sx={{ borderColor: '#eef2f7' }} />

            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 700 }}>
                Page {page} of {pageCount}
              </Typography>

              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  size="small"
                  variant="outlined"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  sx={{ textTransform: 'none', borderRadius: 1 }}
                >
                  Prev
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={page >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  sx={{ textTransform: 'none', borderRadius: 1, bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
                >
                  Next
                </Button>
              </Stack>
            </Box>
          </>
        ) : null}
      </Paper>

      <TransactionDetailsModal
        open={detailsOpen}
        transactionId={selectedId}
        onClose={() => {
          setDetailsOpen(false);
          setSelectedId(null);
        }}
      />
    </Box>
  );
}
