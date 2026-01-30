import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

function isoDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function formatUGX(value) {
  const number = Number(value || 0);
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number);
  return `UGX ${formatted}`;
}

function formatCompactNumber(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number);
}

function StatCard({ title, value, subtitle, accent = '#2563eb' }) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        overflow: 'hidden',
        boxShadow: '0 10px 22px rgba(15, 23, 42, 0.10)',
      }}
    >
      <Box
        sx={{
          height: 4,
          background: `linear-gradient(90deg, ${accent}, rgba(37, 99, 235, 0.0))`,
        }}
      />
      <Box sx={{ p: 2.25 }}>
        <Stack spacing={0.75}>
          <Typography variant="overline" sx={{ fontWeight: 900, color: accent, letterSpacing: 0.6 }}>
            {title}
          </Typography>
          <Typography variant="h5" fontWeight={900} sx={{ lineHeight: 1.15 }}>
            {value}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          ) : null}
        </Stack>
      </Box>
    </Paper>
  );
}

function Panel({ title, right, children }) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        boxShadow: '0 10px 22px rgba(15, 23, 42, 0.08)',
      }}
    >
      <Box
        sx={{
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Typography variant="subtitle1" fontWeight={900}>
          {title}
        </Typography>
        {right}
      </Box>
      <Box sx={{ px: 2, pb: 2 }}>{children}</Box>
    </Paper>
  );
}

function buildPlaceholderData({ startDate, endDate }) {
  const bundles = [
    { key: 'daily', name: 'Daily Unlimited' },
    { key: '12h', name: '12 Hours Unlimited' },
    { key: '2h', name: '2 Hours Unlimited' },
    { key: 'weekly', name: 'Weekly Unlimited' },
    { key: 'monthly', name: 'Monthly Unlimited' },
  ];

  const start = startDate ? new Date(startDate) : addDays(new Date(), -29);
  const end = endDate ? new Date(endDate) : new Date();

  const safeStart = Number.isNaN(start.getTime()) ? addDays(new Date(), -29) : start;
  const safeEnd = Number.isNaN(end.getTime()) ? new Date() : end;

  const days = clamp(Math.floor((safeEnd - safeStart) / (1000 * 60 * 60 * 24)) + 1, 7, 60);

  const daily = Array.from({ length: days }).map((_, idx) => {
    const date = addDays(safeStart, idx);
    const iso = date.toISOString().slice(0, 10);

    const wave = Math.sin((idx / Math.max(1, days - 1)) * Math.PI * 3) * 0.4 + 0.6;
    const noise = (Math.sin(idx * 13.37) + 1) / 2;

    const transactions = Math.max(1, Math.round(2 + wave * 10 + noise * 4));
    const avgTicket = 700 + Math.round(900 * (0.25 + wave)) + Math.round(250 * noise);
    const revenue = Math.round(transactions * avgTicket);

    return {
      date: iso,
      revenue,
      transactions,
    };
  });

  const totalRevenue = daily.reduce((acc, d) => acc + d.revenue, 0);
  const totalTransactions = daily.reduce((acc, d) => acc + d.transactions, 0);
  const commissionRate = 0.006;
  const totalCommission = Math.round(totalRevenue * commissionRate);
  const averageTransaction = totalTransactions ? Math.round(totalRevenue / totalTransactions) : 0;
  const uniqueCustomers = Math.max(5, Math.round(totalTransactions * 0.24));

  const bundlePerformance = bundles
    .map((b, index) => {
      const base = (Math.sin(index * 2.1) + 1.4) / 2.4;
      const revenue = Math.round(totalRevenue * (0.12 + base * 0.2));
      return { bundle: b.name, revenue };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const paymentMethods = [
    { name: 'mobile_money', value: Math.round(totalTransactions * 0.88) },
    { name: 'cash', value: Math.round(totalTransactions * 0.08) },
    { name: 'bank', value: Math.max(0, totalTransactions - Math.round(totalTransactions * 0.96)) },
  ].filter((m) => m.value > 0);

  const hourly = Array.from({ length: 24 }).map((_, hour) => {
    const peak1 = Math.exp(-Math.pow((hour - 12) / 4, 2));
    const peak2 = Math.exp(-Math.pow((hour - 21) / 3, 2));
    const baseline = 0.12;
    const score = baseline + peak1 + 0.85 * peak2;
    const tx = Math.round(score * (totalTransactions / 18));
    return {
      hour: `${String(hour).padStart(2, '0')}:00`,
      transactions: Math.max(0, tx),
    };
  });

  const totalVouchers = 1531;
  const usedVouchers = 437;
  const availableVouchers = totalVouchers - usedVouchers;

  const voucherByBundle = [
    { bundle: '2 Hours Unlimited', used: 175, available: 422 },
    { bundle: 'Daily Unlimited', used: 102, available: 369 },
    { bundle: '12 Hours Unlimited', used: 151, available: 126 },
    { bundle: 'Weekly Unlimited', used: 9, available: 86 },
    { bundle: 'Monthly Unlimited', used: 0, available: 91 },
  ];

  const bundleVoucherStats = voucherByBundle.map((row) => {
    const total = row.used + row.available;
    const usagePct = total ? (row.used / total) * 100 : 0;
    return {
      bundle: row.bundle,
      total,
      used: row.used,
      available: row.available,
      usagePct,
    };
  });

  const recentVoucherUsage = [
    { code: '12D6GGLM', bundle: '12 Hours Unlimited', usedBy: '—', usedAt: `${isoDate(new Date())} 20:49:19` },
    { code: '248JZjG', bundle: 'Daily Unlimited', usedBy: '—', usedAt: `${isoDate(new Date())} 19:53:30` },
    { code: '12GrXxuy', bundle: '12 Hours Unlimited', usedBy: '—', usedAt: `${isoDate(new Date())} 18:55:07` },
    { code: '12WdeZW4', bundle: '12 Hours Unlimited', usedBy: '—', usedAt: `${isoDate(new Date())} 18:26:13` },
    { code: '2X4H4Z', bundle: '2 Hours Unlimited', usedBy: '256704938037', usedAt: `${isoDate(new Date())} 15:47:28` },
    { code: '12dZRuSB', bundle: '12 Hours Unlimited', usedBy: '256706055153', usedAt: `${isoDate(new Date())} 15:46:48` },
    { code: '24VhuXv', bundle: 'Daily Unlimited', usedBy: '256746021342', usedAt: `${isoDate(new Date())} 13:43:16` },
    { code: '24cwigc', bundle: 'Daily Unlimited', usedBy: '256746021343', usedAt: `${isoDate(new Date())} 11:01:01` },
    { code: '123Pe5je', bundle: '12 Hours Unlimited', usedBy: '—', usedAt: `${isoDate(new Date())} 10:37:37` },
    { code: '1274wwJH', bundle: '12 Hours Unlimited', usedBy: '—', usedAt: `${isoDate(new Date())} 10:20:19` },
  ];

  const bundlePerformanceDetails = [
    { bundle: 'Daily Unlimited', totalSales: 57, revenue: 85500, commission: Math.round(85500 * commissionRate), avgSale: 1500 },
    { bundle: '12 Hours Unlimited', totalSales: 62, revenue: 62000, commission: Math.round(62000 * commissionRate), avgSale: 1000 },
    { bundle: '2 Hours Unlimited', totalSales: 76, revenue: 38000, commission: Math.round(38000 * commissionRate), avgSale: 500 },
    { bundle: 'Weekly Unlimited', totalSales: 2, revenue: 12000, commission: Math.round(12000 * commissionRate), avgSale: 6000 },
  ];

  return {
    daily,
    totals: {
      totalRevenue,
      totalCommission,
      averageTransaction,
      uniqueCustomers,
      totalTransactions,
      commissionRate,
    },
    bundlePerformance,
    paymentMethods,
    hourly,
    vouchers: {
      totalVouchers,
      usedVouchers,
      availableVouchers,
      voucherByBundle,
      bundleVoucherStats,
      recentVoucherUsage,
    },
    bundlePerformanceDetails,
  };
}

const PIE_COLORS = ['#3b82f6', '#06b6d4', '#a855f7', '#f97316', '#22c55e'];

export default function AdminReports() {
  const [startDate, setStartDate] = useState(isoDate(addDays(new Date(), -29)));
  const [endDate, setEndDate] = useState(isoDate(new Date()));
  const [appliedRange, setAppliedRange] = useState({
    startDate: isoDate(addDays(new Date(), -29)),
    endDate: isoDate(new Date()),
  });

  const data = useMemo(() => buildPlaceholderData(appliedRange), [appliedRange]);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" fontWeight={900}>
          Reports &amp; Analytics
        </Typography>
      </Box>

      <Paper
        elevation={0}
        sx={{
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          p: 2,
          boxShadow: '0 10px 22px rgba(15, 23, 42, 0.08)',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: {
              xs: '1fr',
              md: 'repeat(3, minmax(0, 1fr))',
            },
            alignItems: 'end',
          }}
        >
          <TextField
            label="Start Date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="End Date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <Button
            variant="contained"
            onClick={() => setAppliedRange({ startDate, endDate })}
            sx={{
              borderRadius: 2,
              py: 1.35,
              fontWeight: 900,
              textTransform: 'none',
            }}
          >
            Apply Filter
          </Button>
        </Box>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(4, minmax(0, 1fr))',
          },
        }}
      >
        <StatCard
          title="TOTAL REVENUE"
          value={formatUGX(data.totals.totalRevenue)}
          subtitle={`${formatCompactNumber(data.totals.totalTransactions)} transactions`}
          accent="#4f46e5"
        />
        <StatCard
          title="TOTAL COMMISSION"
          value={formatUGX(data.totals.totalCommission)}
          subtitle={`${(data.totals.commissionRate * 100).toFixed(1)}% of revenue`}
          accent="#16a34a"
        />
        <StatCard
          title="AVERAGE TRANSACTION"
          value={formatUGX(data.totals.averageTransaction)}
          subtitle="Per transaction average"
          accent="#b45309"
        />
        <StatCard
          title="UNIQUE CUSTOMERS"
          value={formatCompactNumber(data.totals.uniqueCustomers)}
          subtitle="Total unique customers"
          accent="#0284c7"
        />
      </Box>

      <Panel title="Daily Revenue" right={<Chip label="Placeholder" size="small" variant="outlined" />}> 
        <Box sx={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.daily} margin={{ top: 10, right: 24, bottom: 10, left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} minTickGap={20} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'revenue') return [formatUGX(value), 'Revenue (UGX)'];
                  if (name === 'transactions') return [formatCompactNumber(value), 'Transactions'];
                  return [value, name];
                }}
              />
              <Legend
                formatter={(val) => (val === 'revenue' ? 'Revenue (UGX)' : val === 'transactions' ? 'Transactions' : val)}
              />
              <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2.5} dot={false} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="transactions"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      </Panel>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            lg: '2fr 1fr',
          },
          alignItems: 'stretch',
        }}
      >
        <Panel title="Bundle Performance">
          <Box sx={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.bundlePerformance} margin={{ top: 10, right: 18, bottom: 10, left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="bundle" tick={{ fontSize: 12 }} interval={0} angle={-10} height={50} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => formatUGX(v)} />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Panel>

        <Panel title="Payment Methods">
          <Box sx={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip formatter={(v) => formatCompactNumber(v)} />
                <Legend />
                <Pie
                  data={data.paymentMethods}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={65}
                  outerRadius={105}
                  paddingAngle={2}
                >
                  {data.paymentMethods.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </Panel>
      </Box>

      <Panel title="Hourly Sales Distribution">
        <Box sx={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.hourly} margin={{ top: 10, right: 18, bottom: 10, left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="hour" tick={{ fontSize: 12 }} interval={1} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip formatter={(v) => formatCompactNumber(v)} />
              <Legend />
              <Bar dataKey="transactions" name="Transactions" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Panel>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(3, minmax(0, 1fr))',
          },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
            p: 2,
            boxShadow: '0 10px 22px rgba(15, 23, 42, 0.08)',
          }}
        >
          <Typography variant="subtitle2" fontWeight={900} color="text.secondary">
            Total Vouchers
          </Typography>
          <Typography variant="h4" fontWeight={900}>
            {formatCompactNumber(data.vouchers.totalVouchers)}
          </Typography>
        </Paper>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
            p: 2,
            boxShadow: '0 10px 22px rgba(15, 23, 42, 0.08)',
          }}
        >
          <Typography variant="subtitle2" fontWeight={900} color="text.secondary">
            Used Vouchers
          </Typography>
          <Typography variant="h4" fontWeight={900} sx={{ color: '#f59e0b' }}>
            {formatCompactNumber(data.vouchers.usedVouchers)}
          </Typography>
        </Paper>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
            p: 2,
            boxShadow: '0 10px 22px rgba(15, 23, 42, 0.08)',
          }}
        >
          <Typography variant="subtitle2" fontWeight={900} color="text.secondary">
            Available Vouchers
          </Typography>
          <Typography variant="h4" fontWeight={900} sx={{ color: '#16a34a' }}>
            {formatCompactNumber(data.vouchers.availableVouchers)}
          </Typography>
        </Paper>
      </Box>

      <Panel title="Voucher Distribution">
        <Box sx={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.vouchers.voucherByBundle} margin={{ top: 10, right: 18, bottom: 10, left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="bundle" tick={{ fontSize: 12 }} interval={0} angle={-10} height={50} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="used" stackId="a" name="Used Vouchers" fill="#f59e0b" radius={[8, 8, 0, 0]} />
              <Bar dataKey="available" stackId="a" name="Available Vouchers" fill="#22c55e" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Panel>

      <Panel title="Bundle-wise Voucher Statistics">
        <TableContainer>
          <Table size="small" aria-label="bundle-wise voucher stats">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 900 }}>Bundle</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Total Vouchers</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Used</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Available</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Usage %</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.vouchers.bundleVoucherStats.map((row) => (
                <TableRow key={row.bundle} hover>
                  <TableCell>{row.bundle}</TableCell>
                  <TableCell>{formatCompactNumber(row.total)}</TableCell>
                  <TableCell>{formatCompactNumber(row.used)}</TableCell>
                  <TableCell>{formatCompactNumber(row.available)}</TableCell>
                  <TableCell>{row.usagePct.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Panel>

      <Panel title="Recent Voucher Usage">
        <TableContainer>
          <Table size="small" aria-label="recent voucher usage">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 900 }}>Voucher Code</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Bundle</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Used By</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Used At</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.vouchers.recentVoucherUsage.map((row) => (
                <TableRow key={row.code} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 800 }}>{row.code}</TableCell>
                  <TableCell>{row.bundle}</TableCell>
                  <TableCell>{row.usedBy}</TableCell>
                  <TableCell>{row.usedAt}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Panel>

      <Panel title="Bundle Performance Details">
        <TableContainer>
          <Table size="small" aria-label="bundle performance details">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 900 }}>Bundle</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Total Sales</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Revenue</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Commission</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Avg. Sale</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.bundlePerformanceDetails.map((row) => (
                <TableRow key={row.bundle} hover>
                  <TableCell>{row.bundle}</TableCell>
                  <TableCell>{formatCompactNumber(row.totalSales)}</TableCell>
                  <TableCell>{formatUGX(row.revenue)}</TableCell>
                  <TableCell>{formatUGX(row.commission)}</TableCell>
                  <TableCell>{formatUGX(row.avgSale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Panel>

      <Card
        variant="outlined"
        sx={{
          borderRadius: 2,
          boxShadow: '0 10px 22px rgba(15, 23, 42, 0.06)',
        }}
      >
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Note: This Reports page is currently UI-only with placeholder analytics. Next step is wiring it to real backend transactions,
            vouchers, and withdrawals.
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
