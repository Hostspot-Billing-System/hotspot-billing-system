import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  FormControl,
  InputAdornment,
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
import { alpha } from '@mui/material/styles';
import Autocomplete from '@mui/material/Autocomplete';
import { listBundles } from '../services/bundles';
import { bulkDeleteVouchersByIds, deleteVoucherById, listVouchers, sellVoucherDirectlyById, uploadVouchersCsv } from '../services/vouchers';

function extractBackendError(err) {
  const data = err?.response?.data;
  const code = data?.error?.code ?? 'REQUEST_FAILED';
  const message =
    data?.error?.message ??
    err?.message ??
    (err?.code ? `Request failed (${err.code})` : 'Request failed');
  return { code, message };
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function formatDateOnly(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString();
}

function formatTimeOnly(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString();
}

function Icon({ path, size = 18, color = '#0f172a' }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      sx={{ width: size, height: size, display: 'block' }}
      aria-hidden
    >
      <path fill={color} d={path} />
    </Box>
  );
}

const ICONS = {
  search:
    'M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm11 3-6.2-6.2a10 10 0 1 0-2 2L19 23l2-2Z',
  info:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z',
  upload:
    'M19 15v4H5v-4H3v6h18v-6h-2ZM11 15h2V7l3 3 1.4-1.4L12 3.2 6.6 8.6 8 10l3-3v8Z',
  cloud:
    'M19 18H6a4 4 0 0 1-.4-8 6 6 0 0 1 11.6 1.5A3.5 3.5 0 0 1 19 18Zm-8-6v4h2v-4h3l-4-4-4 4h3Z',
  calendar:
    'M7 2h2v2h6V2h2v2h3v18H2V4h5V2Zm13 8H4v10h16V10ZM4 8h16V6H4v2Z',
  trash:
    'M6 7h12l-1 14H7L6 7Zm3-3h6l1 2H8l1-2Z',
  eye:
    'M12 5c5 0 9 7 9 7s-4 7-9 7-9-7-9-7 4-7 9-7Zm0 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  copy:
    'M16 1H6v6H4V1a2 2 0 0 1 2-2h10v2Zm4 6v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Zm-2 0H8v14h10V7Z',
};

function StatusPill({ status }) {
  const s = String(status ?? '').toLowerCase();

  if (s === 'available') {
    return (
      <Chip
        size="small"
        label="Available"
        sx={{
          height: 20,
          fontWeight: 900,
          fontSize: 11,
          bgcolor: '#15803d',
          color: 'common.white',
          borderRadius: 999,
          '& .MuiChip-label': { px: 1, py: 0 },
        }}
      />
    );
  }

  if (s === 'used') {
    return (
      <Chip
        size="small"
        label="Used"
        sx={{
          height: 20,
          fontWeight: 900,
          fontSize: 11,
          bgcolor: '#64748b',
          color: 'common.white',
          borderRadius: 999,
          '& .MuiChip-label': { px: 1, py: 0 },
        }}
      />
    );
  }

  if (s === 'expired') {
    return (
      <Chip
        size="small"
        label="Expired"
        sx={{
          height: 20,
          fontWeight: 900,
          fontSize: 11,
          bgcolor: '#ef4444',
          color: 'common.white',
          borderRadius: 999,
          '& .MuiChip-label': { px: 1, py: 0 },
        }}
      />
    );
  }

  return (
    <Chip
      size="small"
      label={status ?? ''}
      sx={{ height: 20, fontWeight: 900, fontSize: 11, borderRadius: 999, '& .MuiChip-label': { px: 1 } }}
    />
  );
}

function StatCard({ value, label }) {
  return (
    <Paper
      elevation={0}
      sx={{
        flex: 1,
        minWidth: 180,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        px: 3,
        py: 2,
      }}
    >
      <Typography sx={{ fontWeight: 900, fontSize: 20, lineHeight: 1.2, textAlign: 'center' }}>{value}</Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'center' }}>{label}</Typography>
    </Paper>
  );
}

export default function AdminVouchers() {
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packagesError, setPackagesError] = useState(null);

  const [selectedPackage, setSelectedPackage] = useState(null);

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [vouchersError, setVouchersError] = useState(null);
  const [vouchers, setVouchers] = useState([]);

  const [searchCode, setSearchCode] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit, setLimit] = useState(100);

  const [selectedCodes, setSelectedCodes] = useState(() => new Set());

  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const [deleteDialog, setDeleteDialog] = useState({ open: false, deleting: false, row: null });

  const [bulkDeleteDialog, setBulkDeleteDialog] = useState({ open: false, deleting: false, count: 0 });

  const [sellDialog, setSellDialog] = useState({
    open: false,
    selling: false,
    row: null,
    phone: '',
    name: '',
    notes: '',
  });

  useEffect(() => {
    let cancelled = false;

    async function loadPackages() {
      setPackagesLoading(true);
      setPackagesError(null);
      try {
        if (cancelled) return;
        const data = await listBundles();
        if (cancelled) return;
        setPackages(Array.isArray(data) ? data : []);
      } catch (err) {
        if (cancelled) return;
        setPackagesError(extractBackendError(err));
      } finally {
        if (!cancelled) setPackagesLoading(false);
      }
    }

    loadPackages();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadVouchersForPackage() {
      const pkgId = selectedPackage?.id;
      if (!pkgId) {
        setVouchers([]);
        setVouchersError(null);
        setVouchersLoading(false);
        return;
      }

      setVouchersLoading(true);
      setVouchersError(null);
      setSelectedCodes(new Set());

      try {
        const res = await listVouchers({ package_id: String(pkgId) });
        if (cancelled) return;
        const payload = res.data;
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        setVouchers(rows);
      } catch (err) {
        if (cancelled) return;
        setVouchersError(extractBackendError(err));
        setVouchers([]);
      } finally {
        if (!cancelled) setVouchersLoading(false);
      }
    }

    loadVouchersForPackage();
    return () => {
      cancelled = true;
    };
  }, [selectedPackage?.id]);

  const packageOptions = useMemo(() => {
    return packages.map((p) => ({ id: p.id, name: p.name }));
  }, [packages]);

  const selectedPackageMeta = useMemo(() => {
    const pkgId = selectedPackage?.id;
    if (!pkgId) return null;
    return packages.find((p) => Number(p?.id) === Number(pkgId)) ?? null;
  }, [packages, selectedPackage?.id]);

  const stats = useMemo(() => {
    const total = vouchers.length;
    let used = 0;
    let available = 0;

    for (const v of vouchers) {
      const s = String(v?.status ?? '').toLowerCase();
      if (s === 'used') used += 1;
      else if (s === 'available') available += 1;
    }

    return { total, used, available };
  }, [vouchers]);

  const filtered = useMemo(() => {
    let rows = vouchers;

    const query = searchCode.trim().toLowerCase();
    if (query) {
      rows = rows.filter((r) => String(r.code ?? '').toLowerCase().includes(query));
    }

    if (statusFilter) {
      rows = rows.filter((r) => String(r.status ?? '').toLowerCase() === statusFilter);
    }

    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() : null;

    if (from || to) {
      rows = rows.filter((r) => {
        const createdMs = r.created_at ? new Date(r.created_at).getTime() : null;
        if (!createdMs || Number.isNaN(createdMs)) return false;
        if (from && createdMs < from) return false;
        if (to && createdMs > to) return false;
        return true;
      });
    }

    return rows;
  }, [vouchers, searchCode, statusFilter, dateFrom, dateTo]);

  const visibleRows = useMemo(() => filtered.slice(0, Math.max(1, Number(limit) || 100)), [filtered, limit]);

  const canUpload = Boolean(selectedPackage?.id) && Boolean(file) && !uploading;

  function onFileChange(e) {
    const chosen = e.target.files?.[0] ?? null;
    setUploadSuccess(null);
    setUploadError(null);

    if (!chosen) {
      setFile(null);
      return;
    }

    if (!chosen.name.toLowerCase().endsWith('.csv')) {
      setFile(null);
      setUploadError({ code: 'INVALID_FILE', message: 'Please select a .csv file' });
      return;
    }

    setFile(chosen);
  }

  async function onUpload() {
    if (!selectedPackage?.id || !file) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const data = await uploadVouchersCsv({ packageId: selectedPackage.id, file });
      setUploadSuccess({ inserted: data?.inserted, batch_id: data?.batch_id });

      // Refresh vouchers list after upload.
      const res = await listVouchers({ package_id: String(selectedPackage.id) });
      const payload = res.data;
      setVouchers(Array.isArray(payload?.data) ? payload.data : []);
    } catch (err) {
      setUploadError(extractBackendError(err));
    } finally {
      setUploading(false);
    }
  }

  async function copyToClipboard(text) {
    const value = String(text ?? '');
    if (!value) throw new Error('Nothing to copy');

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    // Fallback for older browsers / insecure contexts.
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    try {
      const ok = document.execCommand('copy');
      if (!ok) throw new Error('Copy failed');
    } finally {
      document.body.removeChild(el);
    }
  }

  async function onCopy(code) {
    try {
      await copyToClipboard(code);
      setSnack({ open: true, message: 'Voucher code copied', severity: 'success' });
    } catch {
      setSnack({ open: true, message: 'Failed to copy voucher code', severity: 'error' });
    }
  }

  function onDeleteVoucher(row) {
    const id = row?.id;
    if (!id) {
      setSnack({ open: true, message: 'Cannot delete: missing voucher id', severity: 'error' });
      return;
    }

    setDeleteDialog({ open: true, deleting: false, row });
  }

  async function confirmDeleteVoucher() {
    const row = deleteDialog.row;
    const id = row?.id;
    const code = String(row?.code ?? '');
    if (!id) {
      setSnack({ open: true, message: 'Cannot delete: missing voucher id', severity: 'error' });
      setDeleteDialog({ open: false, deleting: false, row: null });
      return;
    }

    setDeleteDialog((s) => ({ ...s, deleting: true }));

    try {
      await deleteVoucherById(id);
      setVouchers((prev) => prev.filter((v) => v?.id !== id));
      setSelectedCodes((prev) => {
        const next = new Set(prev);
        if (code) next.delete(code);
        return next;
      });
      setSnack({ open: true, message: 'Voucher deleted', severity: 'success' });
      setDeleteDialog({ open: false, deleting: false, row: null });
    } catch (err) {
      const e = extractBackendError(err);
      setSnack({ open: true, message: e.message || 'Failed to delete voucher', severity: 'error' });
      setDeleteDialog((s) => ({ ...s, deleting: false }));
    }
  }

  function toggleAllVisible(checked) {
    if (!checked) {
      setSelectedCodes(new Set());
      return;
    }

    const next = new Set();
    for (const r of visibleRows) {
      if (r?.code) next.add(String(r.code));
    }
    setSelectedCodes(next);
  }

  function toggleOne(code, checked) {
    const next = new Set(selectedCodes);
    const c = String(code);
    if (checked) next.add(c);
    else next.delete(c);
    setSelectedCodes(next);
  }

  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((r) => selectedCodes.has(String(r.code)));
  const anySelected = selectedCodes.size > 0;
  const selectedCount = selectedCodes.size;

  function getSelectedVoucherIds() {
    const byCode = new Map();
    for (const v of vouchers) {
      const code = String(v?.code ?? '');
      if (!code) continue;
      if (v?.id != null) byCode.set(code, Number(v.id));
    }

    const ids = [];
    for (const code of selectedCodes) {
      const id = byCode.get(String(code));
      if (id) ids.push(id);
    }
    return ids;
  }

  function openBulkDeleteDialog() {
    if (!anySelected) return;
    setBulkDeleteDialog({ open: true, deleting: false, count: selectedCount });
  }

  async function confirmBulkDelete() {
    const ids = getSelectedVoucherIds();
    if (ids.length === 0) {
      setSnack({ open: true, message: 'No vouchers selected', severity: 'error' });
      setBulkDeleteDialog({ open: false, deleting: false, count: 0 });
      return;
    }

    setBulkDeleteDialog((s) => ({ ...s, deleting: true }));
    try {
      await bulkDeleteVouchersByIds(ids);
      setVouchers((prev) => prev.filter((v) => !ids.includes(Number(v?.id))));
      setSelectedCodes(new Set());
      setSnack({ open: true, message: `Deleted ${ids.length} voucher(s)`, severity: 'success' });
      setBulkDeleteDialog({ open: false, deleting: false, count: 0 });
    } catch (err) {
      const e = extractBackendError(err);
      setSnack({ open: true, message: e.message || 'Failed to delete selected vouchers', severity: 'error' });
      setBulkDeleteDialog((s) => ({ ...s, deleting: false }));
    }
  }

  function normalizeUgPhone(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('256') && digits.length === 12) return `+${digits}`;
    if (digits.startsWith('0') && digits.length === 10 && digits[1] === '7') return `+256${digits.slice(1)}`;
    if (digits.length === 9 && digits[0] === '7') return `+256${digits}`;
    return null;
  }

  function openSellDialog(row) {
    const id = row?.id;
    const status = String(row?.status ?? '').toLowerCase();
    if (!id) {
      setSnack({ open: true, message: 'Cannot sell: missing voucher id', severity: 'error' });
      return;
    }
    if (status && status !== 'available') {
      setSnack({ open: true, message: 'Only available vouchers can be sold', severity: 'error' });
      return;
    }

    setSellDialog({ open: true, selling: false, row, phone: '', name: '', notes: '' });
  }

  async function confirmSellVoucher() {
    const row = sellDialog.row;
    const id = row?.id;
    if (!id) {
      setSnack({ open: true, message: 'Cannot sell: missing voucher id', severity: 'error' });
      setSellDialog({ open: false, selling: false, row: null, phone: '', name: '', notes: '' });
      return;
    }

    const normalizedPhone = normalizeUgPhone(sellDialog.phone);
    if (!normalizedPhone) {
      setSnack({ open: true, message: 'Customer phone number is required (UG format)', severity: 'error' });
      return;
    }

    setSellDialog((s) => ({ ...s, selling: true }));
    try {
      const res = await sellVoucherDirectlyById(id, {
        phone_number: normalizedPhone,
        customer_name: sellDialog.name,
        notes: sellDialog.notes,
      });

      const usedAt = res?.data?.voucher?.used_at ?? new Date().toISOString();
      const usedBy = res?.data?.voucher?.used_by ?? normalizedPhone;

      setVouchers((prev) =>
        prev.map((v) => {
          if (Number(v?.id) !== Number(id)) return v;
          return { ...v, status: 'used', used_at: usedAt, used_by: usedBy };
        })
      );

      setSnack({ open: true, message: 'Voucher sold successfully', severity: 'success' });
      setSellDialog({ open: false, selling: false, row: null, phone: '', name: '', notes: '' });
    } catch (err) {
      const e = extractBackendError(err);
      setSnack({ open: true, message: e.message || 'Failed to sell voucher', severity: 'error' });
      setSellDialog((s) => ({ ...s, selling: false }));
    }
  }

  return (
    <Box sx={{ width: '100%', pt: 1, pb: 5, px: 0 }}>
      <Typography variant="h4" sx={{ fontWeight: 900, mb: 3 }}>
        Manage Vouchers
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            lg: '560px 1fr',
          },
          alignItems: 'start',
        }}
      >
        {/* Left: Upload Vouchers */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            minWidth: 0,
          }}
        >
          <Stack spacing={1.5} sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              Upload Vouchers
            </Typography>

            <Typography variant="body2" sx={{ fontWeight: 900 }}>
              Select Bundle
            </Typography>

            <Autocomplete
              options={packageOptions}
              value={selectedPackage}
              loading={packagesLoading}
              onChange={(_, next) => {
                setSelectedPackage(next);
                setFile(null);
                setUploadSuccess(null);
                setUploadError(null);
                setSearchCode('');
                setStatusFilter('');
                setDateFrom('');
                setDateTo('');
                setLimit(100);
              }}
              getOptionLabel={(o) => o?.name ?? ''}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder="Search and select a bundle..."
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <InputAdornment position="start" sx={{ ml: 0.5 }}>
                          <Icon path={ICONS.search} size={16} color="#64748b" />
                        </InputAdornment>
                        {params.InputProps.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
              sx={{
                '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' },
              }}
            />

            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
              <Icon path={ICONS.info} size={16} color="#64748b" />
              <Typography variant="caption">
                Start typing to search through {packageOptions.length} available bundles.
              </Typography>
            </Stack>

            {!selectedPackage ? (
              <Paper
                elevation={0}
                sx={{
                  mt: 1,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  p: 4,
                  minHeight: 180,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                <Stack spacing={1} alignItems="center">
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: 999,
                      border: '3px solid',
                      borderColor: 'divider',
                      display: 'grid',
                      placeItems: 'center',
                      color: 'text.secondary',
                    }}
                  >
                    <Typography sx={{ fontWeight: 900, fontSize: 18 }}>i</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Please select a bundle to upload vouchers
                  </Typography>
                </Stack>
              </Paper>
            ) : (
              <>
                <Paper
                  elevation={0}
                  sx={{
                    mt: 0.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    p: 2.5,
                  }}
                >
                  <Stack spacing={1.5} alignItems="center" sx={{ textAlign: 'center' }}>
                    <Box
                      sx={{
                        width: '100%',
                        borderRadius: 2,
                        border: '1px dashed #cbd5e1',
                        bgcolor: alpha('#94a3b8', 0.07),
                        px: 2,
                        py: 3,
                      }}
                    >
                      <Stack spacing={1.25} alignItems="center">
                        <Icon path={ICONS.cloud} size={34} color="#2563eb" />
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          Drag & drop your voucher file here
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          or
                        </Typography>
                        <Button
                          variant="outlined"
                          component="label"
                          size="small"
                          sx={{ textTransform: 'none', borderRadius: 1 }}
                        >
                          Choose File
                          <input type="file" accept=".csv,text/csv" hidden onChange={onFileChange} />
                        </Button>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Supported formats: CSV, PDF, HTML (Max 5MB)
                        </Typography>
                        {file ? (
                          <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 700 }}>
                            {file.name}
                          </Typography>
                        ) : null}
                      </Stack>
                    </Box>

                    <Button
                      fullWidth
                      variant="contained"
                      disabled={!canUpload}
                      onClick={onUpload}
                      startIcon={<Icon path={ICONS.upload} size={16} color="#fff" />}
                      sx={{
                        textTransform: 'none',
                        borderRadius: 1,
                        fontWeight: 900,
                        bgcolor: '#3b82f6',
                        py: 1,
                        '&:hover': { bgcolor: '#2563eb' },
                      }}
                    >
                      {uploading ? 'Uploading…' : 'Upload Vouchers'}
                    </Button>

                    {uploadSuccess ? (
                      <Alert severity="success" sx={{ width: '100%' }}>
                        Inserted: <strong>{uploadSuccess.inserted ?? 0}</strong> — Batch ID:{' '}
                        <strong>{uploadSuccess.batch_id ?? '-'}</strong>
                      </Alert>
                    ) : null}

                    {uploadError ? (
                      <Alert severity="error" sx={{ width: '100%' }}>
                        <Typography variant="body2" fontWeight={800}>
                          {uploadError.code}
                        </Typography>
                        <Typography variant="body2">{uploadError.message}</Typography>
                      </Alert>
                    ) : null}
                  </Stack>
                </Paper>

                <Paper
                  elevation={0}
                  sx={{
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: (theme) =>
                      theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.04) : '#f8fafc',
                    p: 2,
                  }}
                >
                  <Stack spacing={0.5}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Icon path={ICONS.info} size={16} color="#0f172a" />
                      <Typography variant="body2" sx={{ fontWeight: 900 }}>
                        Upload Format Guide
                      </Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Each line should contain:
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      • Username, Password, Duration(days)
                      <br />• Example: user123,pass123,1
                    </Typography>
                  </Stack>
                </Paper>
              </>
            )}

            {packagesError ? (
              <Alert severity="error" sx={{ mt: 1 }}>
                <Typography variant="body2" fontWeight={800}>
                  {packagesError.code}
                </Typography>
                <Typography variant="body2">{packagesError.message}</Typography>
              </Alert>
            ) : null}
          </Stack>
        </Paper>

        {/* Right: Selected Bundle content */}
        {!selectedPackage ? (
          <Paper
            elevation={0}
            sx={{
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              minWidth: 0,
              p: 3,
              minHeight: 210,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            <Stack spacing={1} alignItems="center">
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: 1.5,
                  border: '2px solid',
                  borderColor: 'divider',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Box
                  component="span"
                  sx={{
                    width: 18,
                    height: 18,
                    border: '2px solid',
                    borderColor: 'divider',
                    borderRadius: 0.5,
                    position: 'relative',
                    '&:before, &:after': {
                      content: '""',
                      position: 'absolute',
                      width: 6,
                      height: 6,
                      border: '2px solid',
                      borderColor: 'divider',
                      borderRadius: 0.5,
                      top: -6,
                    },
                    '&:before': { left: -6 },
                    '&:after': { right: -6 },
                  }}
                />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 900 }}>
                Select a Bundle
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Choose a bundle from the list to view voucher statistics and manage vouchers.
              </Typography>
            </Stack>
          </Paper>
        ) : (
          <Stack spacing={2} sx={{ minWidth: 0 }}>
            <Paper
              elevation={0}
              sx={{
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                minWidth: 0,
              }}
            >
              <Stack spacing={1.5} sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 900 }}>
                  Voucher Statistics
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Main Inventory
                </Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <StatCard value={stats.total} label="Total Vouchers" />
                  <StatCard value={stats.used} label="Used Vouchers" />
                  <StatCard value={stats.available} label="Available Vouchers" />
                </Stack>
              </Stack>
            </Paper>

            <Paper
              elevation={0}
              sx={{
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                minWidth: 0,
              }}
            >
              <Stack spacing={1.5} sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 900 }}>
                    Vouchers
                  </Typography>
                  <Chip
                    size="small"
                    label={`${filtered.length} voucher(s) found`}
                    sx={{
                      height: 22,
                      fontWeight: 900,
                      fontSize: 12,
                      bgcolor: '#06b6d4',
                      color: 'common.white',
                      borderRadius: 1,
                    }}
                  />
                </Box>

                <Stack
                  direction={{ xs: 'column', lg: 'row' }}
                  spacing={1}
                  alignItems={{ lg: 'center' }}
                  sx={{
                    flexWrap: 'wrap',
                    gap: 1,
                  }}
                >
                  <TextField
                    size="small"
                    placeholder="Search by voucher code"
                    value={searchCode}
                    onChange={(e) => setSearchCode(e.target.value)}
                    sx={{ minWidth: { xs: '100%', sm: 240 } }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start" sx={{ ml: 0.5 }}>
                          <Icon path={ICONS.search} size={16} color="#64748b" />
                        </InputAdornment>
                      ),
                    }}
                  />

                  <FormControl
                    size="small"
                    sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 140 } }}
                  >
                    <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} displayEmpty>
                      <MenuItem value="">All Status</MenuItem>
                      <MenuItem value="available">Available</MenuItem>
                      <MenuItem value="used">Used</MenuItem>
                      <MenuItem value="expired">Expired</MenuItem>
                    </Select>
                  </FormControl>

                  <TextField
                    size="small"
                    placeholder="mm/dd/yyyy"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 140 } }}
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
                    placeholder="mm/dd/yyyy"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 140 } }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Icon path={ICONS.calendar} size={16} color="#64748b" />
                        </InputAdornment>
                      ),
                    }}
                  />

                  <FormControl
                    size="small"
                    sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 92 } }}
                  >
                    <Select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))}>
                      <MenuItem value="25">25</MenuItem>
                      <MenuItem value="50">50</MenuItem>
                      <MenuItem value="100">100</MenuItem>
                      <MenuItem value="200">200</MenuItem>
                    </Select>
                  </FormControl>

                  <Button
                    variant="contained"
                    sx={{
                      minWidth: 44,
                      minHeight: 44,
                      px: 0,
                      bgcolor: '#2563eb',
                      borderRadius: 1,
                      '&:hover': { bgcolor: '#1d4ed8' },
                    }}
                    onClick={() => console.log('[vouchers] search (client-side)')}
                  >
                    <Icon path={ICONS.search} size={16} color="#fff" />
                  </Button>
                </Stack>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Showing {visibleRows.length} of {filtered.length} vouchers{' '}
                    {filtered.length > limit ? <span style={{ color: '#f59e0b' }}>(limited to {limit})</span> : null}
                  </Typography>

                  <Button
                    variant="contained"
                    disabled={!anySelected}
                    onClick={openBulkDeleteDialog}
                    startIcon={<Icon path={ICONS.trash} size={16} color="#fff" />}
                    sx={{
                      textTransform: 'none',
                      borderRadius: 1,
                      bgcolor: '#f87171',
                      fontWeight: 900,
                      minHeight: 44,
                      width: { xs: '100%', sm: 'auto' },
                      '&:hover': { bgcolor: '#ef4444' },
                    }}
                  >
                    {selectedCount > 0 ? `Delete (${selectedCount})` : 'Delete Selected'}
                  </Button>
                </Box>

                <Divider sx={{ borderColor: 'divider' }} />
                

                {vouchersError ? (
                  <Alert severity="error">
                    <Typography variant="body2" fontWeight={800}>
                      {vouchersError.code}
                    </Typography>
                    <Typography variant="body2">{vouchersError.message}</Typography>
                  </Alert>
                ) : null}

                <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <Table
                    size="small"
                    sx={{
                      width: '100%',
                      minWidth: { xs: 920, lg: 0 },
                      '& th, & td': { py: 0.75 },
                      '& th': {
                        bgcolor: (theme) =>
                          theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.04) : '#f8fafc',
                        fontWeight: 900,
                      },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={allVisibleSelected}
                            indeterminate={!allVisibleSelected && anySelected}
                            onChange={(e) => toggleAllVisible(e.target.checked)}
                          />
                        </TableCell>
                        <TableCell>Code</TableCell>
                        <TableCell>Used By</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Assignment</TableCell>
                        <TableCell>Created</TableCell>
                        <TableCell>Used At</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {vouchersLoading ? (
                        <TableRow>
                          <TableCell colSpan={8}>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                              Loading…
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : visibleRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8}>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                              No vouchers found.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        visibleRows.map((r) => {
                          const code = String(r.code ?? '');
                          const checked = selectedCodes.has(code);

                          return (
                            <TableRow key={code} hover>
                              <TableCell padding="checkbox">
                                <Checkbox
                                  size="small"
                                  checked={checked}
                                  onChange={(e) => toggleOne(code, e.target.checked)}
                                />
                              </TableCell>
                              <TableCell sx={{ fontWeight: 900, color: '#2563eb' }}>{code}</TableCell>
                              <TableCell sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                                {r?.used_by ? String(r.used_by) : 'Not used'}
                              </TableCell>
                              <TableCell>
                                <StatusPill status={r.status} />
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label="— Not Assigned"
                                  sx={{
                                    height: 20,
                                    fontWeight: 800,
                                    fontSize: 11,
                                    bgcolor: (theme) =>
                                      theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.08) : '#e2e8f0',
                                    color: 'text.primary',
                                    borderRadius: 999,
                                    '& .MuiChip-label': { px: 1, py: 0 },
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                                <Box component="span" sx={{ display: 'block' }}>
                                  {formatDateOnly(r.created_at)}
                                </Box>
                                <Box component="span" sx={{ display: 'block' }}>
                                  {formatTimeOnly(r.created_at)}
                                </Box>
                              </TableCell>
                              <TableCell sx={{ color: 'text.secondary' }}>{formatDateTime(r.used_at)}</TableCell>
                              <TableCell align="right">
                                <Stack direction="row" spacing={1} justifyContent="flex-end">
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() => openSellDialog(r)}
                                    sx={{
                                      minWidth: 34,
                                      px: 0,
                                      bgcolor: '#16a34a',
                                      borderRadius: 1,
                                      '&:hover': { bgcolor: '#15803d' },
                                    }}
                                  >
                                    <Icon path={ICONS.eye} size={16} color="#fff" />
                                  </Button>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => onCopy(code)}
                                    sx={{
                                      minWidth: 34,
                                      px: 0,
                                      borderRadius: 1,
                                      borderColor: '#3b82f6',
                                      color: '#2563eb',
                                      bgcolor: 'background.paper',
                                      '&:hover': { borderColor: '#2563eb', bgcolor: 'background.paper' },
                                    }}
                                  >
                                    <Icon path={ICONS.copy} size={16} color="#2563eb" />
                                  </Button>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => onDeleteVoucher(r)}
                                    sx={{
                                      minWidth: 34,
                                      px: 0,
                                      borderRadius: 1,
                                      borderColor: '#fb7185',
                                      color: '#ef4444',
                                      bgcolor: 'background.paper',
                                      '&:hover': { borderColor: '#ef4444', bgcolor: 'background.paper' },
                                    }}
                                  >
                                    <Icon path={ICONS.trash} size={16} color="#ef4444" />
                                  </Button>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            </Paper>
          </Stack>
        )}
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={2200}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ fontWeight: 800 }}
        >
          {snack.message}
        </Alert>
      </Snackbar>

      <Dialog
        open={deleteDialog.open}
        onClose={() => (deleteDialog.deleting ? null : setDeleteDialog({ open: false, deleting: false, row: null }))}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 20px 60px rgba(2, 6, 23, 0.25)',
          },
        }}
      >
        <DialogContent sx={{ p: 3 }}>
          <Typography sx={{ fontWeight: 900, fontSize: 18, mb: 0.75, color: 'text.primary' }}>
            Delete voucher?
          </Typography>

          <Typography sx={{ color: 'text.secondary', fontSize: 13, lineHeight: 1.5 }}>
            This action cannot be undone. If the voucher has already been used or expired, deletion may be blocked.
          </Typography>

          {deleteDialog.row?.code ? (
            <Box
              sx={{
                mt: 2,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                px: 1.25,
                py: 0.75,
                borderRadius: 2,
                bgcolor: alpha('#ef4444', 0.08),
                border: `1px solid ${alpha('#ef4444', 0.22)}`,
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  bgcolor: '#ef4444',
                }}
              />
              <Typography sx={{ fontWeight: 900, color: 'text.primary', fontSize: 13 }}>
                {String(deleteDialog.row.code)}
              </Typography>
            </Box>
          ) : null}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            variant="outlined"
            disabled={deleteDialog.deleting}
            onClick={() => setDeleteDialog({ open: false, deleting: false, row: null })}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              borderColor: 'divider',
              color: 'text.primary',
              bgcolor: 'background.paper',
              '&:hover': { borderColor: 'divider', bgcolor: 'background.paper' },
            }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            disabled={deleteDialog.deleting}
            onClick={confirmDeleteVoucher}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              bgcolor: '#ef4444',
              fontWeight: 900,
              px: 2.5,
              '&:hover': { bgcolor: '#dc2626' },
            }}
          >
            {deleteDialog.deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={bulkDeleteDialog.open}
        onClose={() => (bulkDeleteDialog.deleting ? null : setBulkDeleteDialog({ open: false, deleting: false, count: 0 }))}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 20px 60px rgba(2, 6, 23, 0.25)',
          },
        }}
      >
        <DialogContent sx={{ p: 3 }}>
          <Typography sx={{ fontWeight: 900, fontSize: 18, mb: 0.75, color: 'text.primary' }}>
            Delete selected vouchers?
          </Typography>

          <Typography sx={{ color: 'text.secondary', fontSize: 13, lineHeight: 1.5 }}>
            You are about to delete {bulkDeleteDialog.count} vouchers. This action cannot be undone.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            variant="outlined"
            disabled={bulkDeleteDialog.deleting}
            onClick={() => setBulkDeleteDialog({ open: false, deleting: false, count: 0 })}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              borderColor: 'divider',
              color: 'text.primary',
              bgcolor: 'background.paper',
              '&:hover': { borderColor: 'divider', bgcolor: 'background.paper' },
            }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            disabled={bulkDeleteDialog.deleting}
            onClick={confirmBulkDelete}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              bgcolor: '#ef4444',
              fontWeight: 900,
              px: 2.5,
              '&:hover': { bgcolor: '#dc2626' },
            }}
          >
            {bulkDeleteDialog.deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={sellDialog.open}
        onClose={() => (sellDialog.selling ? null : setSellDialog({ open: false, selling: false, row: null, phone: '', name: '', notes: '' }))}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 20px 60px rgba(2, 6, 23, 0.25)',
          },
        }}
      >
        <DialogContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1.5 }}>
            <Typography sx={{ fontWeight: 900, fontSize: 18, color: 'text.primary' }}>
              Sell Voucher Directly
            </Typography>
            <Button
              variant="text"
              disabled={sellDialog.selling}
              onClick={() => setSellDialog({ open: false, selling: false, row: null, phone: '', name: '', notes: '' })}
              sx={{ minWidth: 36, px: 1, color: 'text.secondary', fontWeight: 900, textTransform: 'none' }}
            >
              ×
            </Button>
          </Box>

          <Paper
            elevation={0}
            sx={{
              borderRadius: 2,
              border: '1px solid',
              borderColor: (theme) =>
                theme.palette.mode === 'dark' ? alpha(theme.palette.info.main, 0.35) : '#bae6fd',
              bgcolor: (theme) => (theme.palette.mode === 'dark' ? alpha(theme.palette.info.main, 0.12) : '#e0f2fe'),
              p: 2,
              mb: 2,
            }}
          >
            <Typography sx={{ fontWeight: 900, color: 'text.primary', fontSize: 13 }}>
              Direct Sale:
              <Typography component="span" sx={{ fontWeight: 700, color: 'text.primary', fontSize: 13 }}>
                {' '}This voucher will be marked as used and an SMS will be sent to the customer with the voucher details.
              </Typography>
            </Typography>
          </Paper>

          <Typography sx={{ fontWeight: 900, mb: 1 }}>Voucher Details:</Typography>

          <Paper
            elevation={0}
            sx={{
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              p: 2,
              mb: 2,
            }}
          >
            <Typography sx={{ fontWeight: 900, color: 'text.primary', fontSize: 13 }}>
              Code:{' '}
              <Box component="span" sx={{ color: 'primary.main' }}>
                {String(sellDialog.row?.code ?? '')}
              </Box>
            </Typography>
            <Typography sx={{ fontWeight: 700, color: 'text.primary', fontSize: 13, mt: 0.5 }}>
              Bundle: {String(sellDialog.row?.package_name ?? selectedPackage?.name ?? '')}
            </Typography>
            <Typography sx={{ fontWeight: 700, color: 'text.primary', fontSize: 13, mt: 0.5 }}>
              Price: UGX {Number(selectedPackageMeta?.price_ugx ?? selectedPackageMeta?.price ?? 0).toLocaleString()}
            </Typography>
          </Paper>

          <TextField
            fullWidth
            required
            label="Customer Phone Number"
            placeholder="e.g., 0701234567"
            value={sellDialog.phone}
            onChange={(e) => setSellDialog((s) => ({ ...s, phone: e.target.value }))}
            sx={{ mb: 1.5 }}
          />
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: -1, mb: 2 }}>
            The voucher code will be sent to this number via SMS
          </Typography>

          <TextField
            fullWidth
            label="Customer Name (optional)"
            placeholder="Customer's name"
            value={sellDialog.name}
            onChange={(e) => setSellDialog((s) => ({ ...s, name: e.target.value }))}
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Notes (optional)"
            placeholder="Any additional notes about this sale"
            value={sellDialog.notes}
            onChange={(e) => setSellDialog((s) => ({ ...s, notes: e.target.value }))}
            sx={{ mb: 2 }}
          />

          <Paper
            elevation={0}
            sx={{
              borderRadius: 2,
              border: '1px solid #fde68a',
              bgcolor: '#fef3c7',
              p: 2,
            }}
          >
            <Typography sx={{ color: '#92400e', fontSize: 13, fontWeight: 700 }}>
              Payment Method: <span style={{ fontWeight: 700 }}>Cash only.</span> This transaction will be recorded as a completed cash sale.
            </Typography>
          </Paper>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            variant="outlined"
            disabled={sellDialog.selling}
            onClick={() => setSellDialog({ open: false, selling: false, row: null, phone: '', name: '', notes: '' })}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              borderColor: 'divider',
              color: 'text.primary',
              bgcolor: 'background.paper',
              '&:hover': { borderColor: 'divider', bgcolor: 'background.paper' },
            }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            disabled={sellDialog.selling}
            onClick={confirmSellVoucher}
            startIcon={<Icon path={ICONS.eye} size={16} color="#fff" />}
            sx={{
              textTransform: 'none',
              borderRadius: 1.5,
              bgcolor: '#16a34a',
              fontWeight: 900,
              px: 2.5,
              '&:hover': { bgcolor: '#15803d' },
            }}
          >
            {sellDialog.selling ? 'Selling…' : 'Sell Voucher & Send SMS'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
