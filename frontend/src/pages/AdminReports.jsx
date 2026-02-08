import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { alpha, useTheme } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
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
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getBundlePerformance,
  getBundlePerformanceDetails,
  getDailyRevenue,
  getHourlySales,
  getPaymentMethods,
  getRecentVoucherUsage,
  getReportsSummary,
  getVoucherDistribution,
  getVoucherStats,
} from '../services/reports';

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

function percent(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(1)}%`;
}

function StatCard({ title, value, footer, accent }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
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
      <Typography sx={{ mt: 1, fontSize: 26, fontWeight: 900, color: 'text.primary' }}>{value}</Typography>
      <Typography sx={{ mt: 1, fontSize: 13, color: 'text.secondary' }}>{footer}</Typography>
    </Paper>
  );
}

function ChartCard({ title, children }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Typography sx={{ fontWeight: 900, fontSize: 13, color: 'text.secondary', mb: 1.5 }}>{title}</Typography>
      {children}
    </Paper>
  );
}

export default function AdminReports() {
  const theme = useTheme();

  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [summary, setSummary] = useState(null);
  const [dailyRevenue, setDailyRevenue] = useState([]);
  const [bundlePerformance, setBundlePerformance] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [hourlySales, setHourlySales] = useState([]);
  const [voucherStats, setVoucherStats] = useState(null);
  const [voucherDistribution, setVoucherDistribution] = useState([]);
  const [recentVoucherUsage, setRecentVoucherUsage] = useState([]);
  const [bundlePerformanceDetails, setBundlePerformanceDetails] = useState([]);

  const queryParams = useMemo(() => {
    const params = {};
    if (startDate && dayjs(startDate).isValid()) params.start_date = dayjs(startDate).format('YYYY-MM-DD');
    if (endDate && dayjs(endDate).isValid()) params.end_date = dayjs(endDate).format('YYYY-MM-DD');
    return params;
  }, [startDate, endDate]);

  const appliedRangeLabel = useMemo(() => {
    const s = summary?.data?.start_date;
    const e = summary?.data?.end_date;
    if (!s || !e) return 'Last 30 days';
    return `${s} → ${e}`;
  }, [summary?.data?.end_date, summary?.data?.start_date]);

  async function loadAll(params) {
    setLoading(true);
    setError(null);

    try {
      const [
        summaryRes,
        dailyRes,
        bundleRes,
        methodsRes,
        hourlyRes,
        voucherStatsRes,
        voucherDistRes,
        recentUsageRes,
        perfDetailsRes,
      ] = await Promise.all([
        getReportsSummary(params),
        getDailyRevenue(params),
        getBundlePerformance(params),
        getPaymentMethods(params),
        getHourlySales(params),
        getVoucherStats(params),
        getVoucherDistribution(params),
        getRecentVoucherUsage(params),
        getBundlePerformanceDetails(params),
      ]);

      setSummary(summaryRes?.data ?? null);
      setDailyRevenue(dailyRes?.data?.data?.rows ?? []);
      setBundlePerformance(bundleRes?.data?.data?.rows ?? []);
      setPaymentMethods(methodsRes?.data?.data?.rows ?? []);
      setHourlySales(hourlyRes?.data?.data?.rows ?? []);
      setVoucherStats(voucherStatsRes?.data?.data ?? null);
      setVoucherDistribution(voucherDistRes?.data?.data?.rows ?? []);
      setRecentVoucherUsage(recentUsageRes?.data?.data?.rows ?? []);
      setBundlePerformanceDetails(perfDetailsRes?.data?.data?.rows ?? []);
    } catch (err) {
      setError(extractBackendError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll({});
  }, []);

  const summaryData = summary?.data ?? null;
  const totalRevenue = summaryData?.total_revenue_ugx ?? 0;
  const successfulTx = summaryData?.successful_transactions ?? 0;
  const totalCommission = summaryData?.total_commission_ugx ?? 0;
  const avgTx = summaryData?.average_transaction_ugx ?? 0;
  const uniqueCustomers = summaryData?.unique_customers ?? 0;

  const dailyChartData = useMemo(
    () =>
      dailyRevenue.map((r) => ({
        day: r.day,
        label: dayjs(r.day).format('MMM D'),
        revenue_ugx: Number(r.revenue_ugx ?? 0),
        transactions: Number(r.transactions ?? 0),
      })),
    [dailyRevenue]
  );

  const hourlyChartData = useMemo(
    () =>
      hourlySales.map((r) => ({
        hour: Number(r.hour ?? 0),
        label: `${String(r.hour ?? 0).padStart(2, '0')}:00`,
        transactions: Number(r.transactions ?? 0),
      })),
    [hourlySales]
  );

  const bundleRevenueChartData = useMemo(
    () =>
      bundlePerformance.map((r) => ({
        bundle_name: r.bundle_name,
        revenue_ugx: Number(r.revenue_ugx ?? 0),
      })),
    [bundlePerformance]
  );

  const voucherDistChartData = useMemo(
    () =>
      voucherDistribution.map((r) => ({
        bundle_name: r.bundle_name,
        used: Number(r.used ?? 0),
        available: Number(r.available ?? 0),
      })),
    [voucherDistribution]
  );

  const paymentMethodsPieData = useMemo(
    () =>
      paymentMethods.map((r) => ({
        name: String(r.payment_method ?? ''),
        value: Number(r.transactions ?? 0),
      })),
    [paymentMethods]
  );

  const gridStroke = theme.palette.divider;
  const axisTick = theme.palette.text.secondary;
  const tooltipStyles = useMemo(
    () => ({
      contentStyle: {
        backgroundColor: theme.palette.background.paper,
        borderColor: theme.palette.divider,
        borderRadius: 10,
        boxShadow: 'none',
      },
      labelStyle: { color: theme.palette.text.primary },
      itemStyle: { color: theme.palette.text.primary },
    }),
    [theme.palette.background.paper, theme.palette.divider, theme.palette.text.primary]
  );

  return (
    <Box sx={{ width: '100%', pt: { xs: 0.5, sm: 1 }, pb: { xs: 2, sm: 3 }, px: 0 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900, color: 'text.primary' }}>
            Reports & Analytics
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 13, mt: 0.5 }}>{appliedRangeLabel}</Typography>
        </Box>

        {/* Date Filter */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
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
                  textField: { size: 'small', placeholder: 'mm/dd/yyyy', sx: { bgcolor: 'background.paper' } },
                }}
              />
              <DatePicker
                label="End Date"
                value={endDate}
                onChange={(v) => setEndDate(v ?? null)}
                slotProps={{
                  textField: { size: 'small', placeholder: 'mm/dd/yyyy', sx: { bgcolor: 'background.paper' } },
                }}
              />
            </LocalizationProvider>

            <Button
              variant="contained"
              disabled={loading}
              onClick={() => loadAll(queryParams)}
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
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
          }}
        >
          <StatCard
            title="Total Revenue"
            accent="#4f46e5"
            value={formatUgx0(totalRevenue)}
            footer={`${UGX.format(Number(successfulTx ?? 0))} transactions`}
          />
          <StatCard
            title="Total Commission"
            accent="#16a34a"
            value={formatUgx0(totalCommission)}
            footer={`${percent((Number(totalRevenue) > 0 ? (Number(totalCommission) / Number(totalRevenue)) * 100 : 0))} of revenue`}
          />
          <StatCard
            title="Average Transaction"
            accent="#b45309"
            value={formatUgx0(avgTx)}
            footer="Per transaction average"
          />
          <StatCard
            title="Unique Customers"
            accent="#0891b2"
            value={UGX.format(Number(uniqueCustomers ?? 0))}
            footer="Total unique customers"
          />
        </Box>

        {/* Daily Revenue Chart */}
        <ChartCard title="Daily Revenue">
          <Box sx={{ width: '100%', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyChartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="label" stroke={gridStroke} tick={{ fill: axisTick }} />
                <YAxis yAxisId="left" tickFormatter={(v) => UGX.format(v)} stroke={gridStroke} tick={{ fill: axisTick }} />
                <YAxis yAxisId="right" orientation="right" stroke={gridStroke} tick={{ fill: axisTick }} />
                <Tooltip
                  contentStyle={tooltipStyles.contentStyle}
                  labelStyle={tooltipStyles.labelStyle}
                  itemStyle={tooltipStyles.itemStyle}
                  formatter={(value, name) => {
                    if (name === 'revenue_ugx') return [formatUgx0(value), 'Revenue'];
                    if (name === 'transactions') return [UGX.format(value), 'Transactions'];
                    return [value, name];
                  }}
                  labelFormatter={(label, payload) => {
                    const raw = payload?.[0]?.payload?.day;
                    return raw ? dayjs(raw).format('YYYY-MM-DD') : label;
                  }}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="revenue_ugx" stroke="#22c55e" strokeWidth={2} dot={false} name="Revenue (UGX)" />
                <Line yAxisId="right" type="monotone" dataKey="transactions" stroke="#2563eb" strokeWidth={2} dot={false} name="Transactions" />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </ChartCard>

        {/* Bundle Performance + Payment Methods */}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', lg: '1.3fr 1fr' },
            alignItems: 'stretch',
          }}
        >
          <ChartCard title="Bundle Performance">
            <Box sx={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bundleRevenueChartData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="bundle_name" interval={0} angle={-15} textAnchor="end" height={60} stroke={gridStroke} tick={{ fill: axisTick }} />
                    <YAxis tickFormatter={(v) => UGX.format(v)} stroke={gridStroke} tick={{ fill: axisTick }} />
                  <Tooltip
                      contentStyle={tooltipStyles.contentStyle}
                      labelStyle={tooltipStyles.labelStyle}
                      itemStyle={tooltipStyles.itemStyle}
                    formatter={(value) => [formatUgx0(value), 'Revenue']}
                    labelFormatter={(label) => String(label)}
                  />
                  <Bar dataKey="revenue_ugx" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </ChartCard>

          <ChartCard title="Payment Methods">
            <Box sx={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={tooltipStyles.contentStyle}
                    labelStyle={tooltipStyles.labelStyle}
                    itemStyle={tooltipStyles.itemStyle}
                    formatter={(value, name, props) => [UGX.format(value), props?.payload?.name ?? '']}
                  />
                  <Pie
                    data={paymentMethodsPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={110}
                    fill="#2563eb"
                    stroke={theme.palette.background.paper}
                    strokeWidth={2}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </ChartCard>
        </Box>

        {/* Hourly Sales */}
        <ChartCard title="Hourly Sales Distribution">
          <Box sx={{ width: '100%', height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="label" stroke={gridStroke} tick={{ fill: axisTick }} />
                <YAxis allowDecimals={false} stroke={gridStroke} tick={{ fill: axisTick }} />
                <Tooltip
                  contentStyle={tooltipStyles.contentStyle}
                  labelStyle={tooltipStyles.labelStyle}
                  itemStyle={tooltipStyles.itemStyle}
                  formatter={(value) => [UGX.format(value), 'Transactions']}
                />
                <Legend />
                <Bar dataKey="transactions" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </ChartCard>

        {/* Voucher metrics */}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          }}
        >
          <StatCard
            title="Total Vouchers"
            accent="#0f172a"
            value={UGX.format(Number(voucherStats?.total ?? 0))}
            footer=""
          />
          <StatCard
            title="Used Vouchers"
            accent="#f59e0b"
            value={UGX.format(Number(voucherStats?.used ?? 0))}
            footer=""
          />
          <StatCard
            title="Available Vouchers"
            accent="#16a34a"
            value={UGX.format(Number(voucherStats?.available ?? 0))}
            footer=""
          />
        </Box>

        {/* Voucher Distribution + Bundle-wise table */}
        <ChartCard title="Voucher Distribution">
          <Box sx={{ width: '100%', height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={voucherDistChartData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="bundle_name" interval={0} angle={-10} textAnchor="end" height={60} stroke={gridStroke} tick={{ fill: axisTick }} />
                <YAxis allowDecimals={false} stroke={gridStroke} tick={{ fill: axisTick }} />
                <Tooltip contentStyle={tooltipStyles.contentStyle} labelStyle={tooltipStyles.labelStyle} itemStyle={tooltipStyles.itemStyle} />
                <Legend />
                <Bar dataKey="used" stackId="a" fill="#f59e0b" />
                <Bar dataKey="available" stackId="a" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          </Box>

          <Box sx={{ mt: 2 }}>
            <Typography sx={{ fontWeight: 900, fontSize: 13, color: 'text.secondary', mb: 1 }}>
              Bundle-wise Voucher Statistics
            </Typography>
            <TableContainer>
              <Table
                size="small"
                sx={{
                  '& th': {
                    fontWeight: 900,
                    bgcolor: (t) => (t.palette.mode === 'dark' ? alpha(t.palette.common.white, 0.04) : '#f8fafc'),
                  },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Bundle</TableCell>
                    <TableCell align="right">Total Vouchers</TableCell>
                    <TableCell align="right">Used</TableCell>
                    <TableCell align="right">Available</TableCell>
                    <TableCell align="right">Usage %</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {voucherDistribution.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ color: 'text.secondary' }}>
                        No voucher data.
                      </TableCell>
                    </TableRow>
                  ) : (
                    voucherDistribution.map((r) => (
                      <TableRow key={String(r.bundle_name)} hover>
                        <TableCell>{r.bundle_name}</TableCell>
                        <TableCell align="right">{UGX.format(Number(r.total ?? 0))}</TableCell>
                        <TableCell align="right">{UGX.format(Number(r.used ?? 0))}</TableCell>
                        <TableCell align="right">{UGX.format(Number(r.available ?? 0))}</TableCell>
                        <TableCell align="right">{percent(r.usage_pct ?? 0)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </ChartCard>

        {/* Recent Voucher Usage */}
        <ChartCard title="Recent Voucher Usage">
          <TableContainer>
            <Table
              size="small"
              sx={{
                '& th': {
                  fontWeight: 900,
                  bgcolor: (t) => (t.palette.mode === 'dark' ? alpha(t.palette.common.white, 0.04) : '#f8fafc'),
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>Voucher Code</TableCell>
                  <TableCell>Bundle</TableCell>
                  <TableCell>Used By</TableCell>
                  <TableCell>Used At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recentVoucherUsage.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ color: 'text.secondary' }}>
                      No recent voucher usage.
                    </TableCell>
                  </TableRow>
                ) : (
                  recentVoucherUsage.map((r) => (
                    <TableRow key={String(r.voucher_code)} hover>
                      <TableCell sx={{ fontWeight: 900, color: '#2563eb' }}>{r.voucher_code}</TableCell>
                      <TableCell>{r.bundle_name}</TableCell>
                      <TableCell>{r.used_by ?? ''}</TableCell>
                      <TableCell>{r.used_at ? dayjs(r.used_at).format('YYYY-MM-DD HH:mm:ss') : ''}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </ChartCard>

        {/* Bundle Performance Details */}
        <ChartCard title="Bundle Performance Details">
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Bundle</TableCell>
                  <TableCell align="right">Total Sales</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                  <TableCell align="right">Commission</TableCell>
                  <TableCell align="right">Avg. Sale</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bundlePerformanceDetails.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ color: 'text.secondary' }}>
                      No bundle performance data.
                    </TableCell>
                  </TableRow>
                ) : (
                  bundlePerformanceDetails.map((r) => (
                    <TableRow key={String(r.bundle_name)} hover>
                      <TableCell>{r.bundle_name}</TableCell>
                      <TableCell align="right">{UGX.format(Number(r.total_sales ?? 0))}</TableCell>
                      <TableCell align="right">{formatUgx0(r.revenue_ugx ?? 0)}</TableCell>
                      <TableCell align="right">{formatUgx0(r.commission_ugx ?? 0)}</TableCell>
                      <TableCell align="right">{formatUgx0(r.avg_sale_ugx ?? 0)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography sx={{ mt: 1.5, color: 'text.secondary', fontSize: 12 }}>
            Notes: Revenue and commission are computed from successful mobile_money transactions only.
          </Typography>
        </ChartCard>

        {/* Loading indicator */}
        {loading ? (
          <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>Loading reports…</Typography>
        ) : null}
      </Stack>
    </Box>
  );
}
