import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Pagination,
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

import { getClientsOverview } from '../services/clients';

function extractBackendError(err) {
  const data = err?.response?.data;
  const code = data?.error?.code ?? 'REQUEST_FAILED';
  const message =
    data?.error?.message ??
    err?.message ??
    (err?.code ? `Request failed (${err.code})` : 'Request failed');
  return { code, message };
}

const UGX = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function formatUgx0(value) {
  const n = Number(value ?? 0);
  return `UGX ${UGX.format(Number.isFinite(n) ? n : 0)}`;
}

function StatCard({ title, value, footer, accent }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 2.5,
        border: '1px solid #e5e7eb',
        bgcolor: 'common.white',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          bgcolor: accent,
        }}
      />
      <Typography sx={{ fontSize: 12, fontWeight: 900, color: accent, textTransform: 'uppercase' }}>{title}</Typography>
      <Typography sx={{ mt: 1, fontSize: 26, fontWeight: 900, color: '#0f172a' }}>{value}</Typography>
      {footer ? <Typography sx={{ mt: 1, fontSize: 13, color: '#475569' }}>{footer}</Typography> : null}
    </Paper>
  );
}

export default function AdminClients() {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const limit = 10;

  const queryParams = useMemo(() => {
    const params = { page, limit };
    if (startDate && dayjs(startDate).isValid()) params.start_date = dayjs(startDate).format('YYYY-MM-DD');
    if (endDate && dayjs(endDate).isValid()) params.end_date = dayjs(endDate).format('YYYY-MM-DD');
    return params;
  }, [endDate, page, startDate]);

  const appliedRangeLabel = useMemo(() => {
    const s = data?.start_date;
    const e = data?.end_date;
    if (!s || !e) return 'Last 30 days';
    return `${s} → ${e}`;
  }, [data?.end_date, data?.start_date]);

  async function load(params) {
    setLoading(true);
    setError(null);
    try {
      const res = await getClientsOverview(params);
      setData(res?.data?.data ?? null);
    } catch (err) {
      setError(extractBackendError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load({ page: 1, limit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = data?.summary ?? {};
  const rows = data?.rows ?? [];
  const pagination = data?.pagination ?? { page: 1, total_pages: 1 };

  return (
    <Box sx={{ width: '100%', pt: { xs: 0.5, sm: 1 }, pb: { xs: 2, sm: 3 }, px: 0 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900, color: '#0f172a' }}>
            Clients Overview
          </Typography>
          <Typography sx={{ color: '#64748b', fontSize: 13, mt: 0.5 }}>{appliedRangeLabel}</Typography>
        </Box>

        {/* Date Filter */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 2.5,
            border: '1px solid #e5e7eb',
            bgcolor: 'common.white',
          }}
        >
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                md: '1fr 1fr 1fr',
              },
              alignItems: 'end',
            }}
          >
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                label="Start Date"
                value={startDate}
                onChange={(v) => setStartDate(v ?? null)}
                slotProps={{
                  textField: { size: 'small', placeholder: 'mm/dd/yyyy', sx: { bgcolor: 'common.white' } },
                }}
              />
              <DatePicker
                label="End Date"
                value={endDate}
                onChange={(v) => setEndDate(v ?? null)}
                slotProps={{
                  textField: { size: 'small', placeholder: 'mm/dd/yyyy', sx: { bgcolor: 'common.white' } },
                }}
              />
            </LocalizationProvider>

            <Button
              variant="contained"
              disabled={loading}
              onClick={() => {
                setPage(1);
                load({ ...queryParams, page: 1 });
              }}
              sx={{
                minHeight: 44,
                textTransform: 'none',
                fontWeight: 900,
                borderRadius: 1.5,
                bgcolor: '#2563eb',
                '&:hover': { bgcolor: '#1d4ed8' },
              }}
            >
              Apply Filter
            </Button>
          </Box>
        </Paper>

        {error ? (
          <Alert severity="error">
            <Typography sx={{ fontWeight: 900 }}>{error.code}</Typography>
            <Typography>{error.message}</Typography>
          </Alert>
        ) : null}

        {/* Summary Cards */}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              md: 'repeat(3, 1fr)',
            },
          }}
        >
          <StatCard
            title="Total Clients"
            accent="#4f46e5"
            value={UGX.format(Number(summary.total_clients ?? 0))}
            footer="Unique clients in period"
          />
          <StatCard
            title="Total Transactions"
            accent="#16a34a"
            value={UGX.format(Number(summary.total_transactions ?? 0))}
            footer="Combined transactions"
          />
          <StatCard
            title="Total Revenue"
            accent="#0891b2"
            value={formatUgx0(summary.total_revenue_ugx ?? 0)}
            footer="Total earnings"
          />
        </Box>

        {/* Clients Table */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2.5,
            border: '1px solid #e5e7eb',
            bgcolor: 'common.white',
            overflow: 'hidden',
          }}
        >
          <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <Table size="small" sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 900 }}>CUSTOMER PHONE</TableCell>
                  <TableCell sx={{ fontWeight: 900 }} align="center">
                    TOTAL PURCHASES
                  </TableCell>
                  <TableCell sx={{ fontWeight: 900 }} align="right">
                    TOTAL SPENT
                  </TableCell>
                  <TableCell sx={{ fontWeight: 900 }} align="center">
                    LAST PURCHASE
                  </TableCell>
                  <TableCell sx={{ fontWeight: 900 }} align="center">
                    VISIT DAYS
                  </TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>PURCHASED BUNDLES</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ color: 'text.secondary' }}>
                      {loading ? 'Loading…' : 'No clients in this period.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={String(row.customer_phone)} hover>
                      <TableCell sx={{ fontWeight: 800 }}>{row.customer_phone}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={String(row.total_purchases ?? 0)}
                          size="small"
                          sx={{ bgcolor: '#2563eb', color: 'white', fontWeight: 900 }}
                        />
                      </TableCell>
                      <TableCell align="right">{formatUgx0(row.total_spent_ugx ?? 0)}</TableCell>
                      <TableCell align="center">{row.last_purchase_date ?? ''}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={`${String(row.visit_days ?? 0)} days`}
                          size="small"
                          sx={{ bgcolor: '#16a34a', color: 'white', fontWeight: 900 }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: '#64748b' }}>
                        {(row.purchased_bundles ?? []).join(', ')}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Box
            sx={{
              p: 2,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Pagination
              count={Number(pagination.total_pages ?? 1)}
              page={Number(pagination.page ?? page)}
              onChange={(_, next) => {
                setPage(next);
                load({ ...queryParams, page: next });
              }}
              color="primary"
              size="small"
              disabled={loading}
            />
          </Box>
        </Paper>

        {loading ? <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>Loading clients…</Typography> : null}
      </Stack>
    </Box>
  );
}
