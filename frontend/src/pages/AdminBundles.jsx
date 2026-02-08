import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';

import { createBundle, deleteBundle, listBundles, patchBundleStatus, updateBundle } from '../services/bundles';

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

const NEUTRAL_CHIP_SX = {
  bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#444444' : theme.palette.grey[100]),
  border: 1,
  borderColor: 'divider',
  color: (theme) => (theme.palette.mode === 'dark' ? theme.palette.common.white : theme.palette.text.primary),
  fontWeight: 900,
};

export default function AdminBundles() {
  // Always use card layout to avoid table clipping/hidden actions on mid-size laptops.
  // (The right panel is narrower due to the admin sidebar and left form column.)
  const useCardLayout = true;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [createLoading, setCreateLoading] = useState(false);
  const [statusLoadingById, setStatusLoadingById] = useState({});

  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editBundleId, setEditBundleId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', duration: '', price: '', description: '' });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [draftSearch, setDraftSearch] = useState('');
  const [draftStatus, setDraftStatus] = useState('all');
  const [filters, setFilters] = useState({ q: '', status: 'all' });
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [form, setForm] = useState({ name: '', duration: '', price: '', description: '' });
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'info' });

  async function loadBundles() {
    setLoading(true);
    setError(null);
    try {
      const list = await listBundles(includeDeleted ? { include_deleted: true } : undefined);
      setRows(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(extractBackendError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const list = await listBundles(includeDeleted ? { include_deleted: true } : undefined);
        if (cancelled) return;
        setRows(Array.isArray(list) ? list : []);
      } catch (err) {
        if (cancelled) return;
        setError(extractBackendError(err));
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [includeDeleted]);

  function parseRequiredInt(value) {
    const n = Number(String(value ?? '').trim());
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  }

  async function onCreate() {
    const name = String(form.name ?? '').trim();
    const duration_minutes = parseRequiredInt(form.duration);
    const price_ugx = parseRequiredInt(form.price);
    const description = String(form.description ?? '').trim() || null;

    if (!name) {
      setSnack({ open: true, message: 'Bundle name is required.', severity: 'error' });
      return;
    }
    if (!duration_minutes) {
      setSnack({ open: true, message: 'Duration (minutes) is required.', severity: 'error' });
      return;
    }
    if (!price_ugx) {
      setSnack({ open: true, message: 'Price (UGX) is required.', severity: 'error' });
      return;
    }

    setCreateLoading(true);
    try {
      await createBundle({ name, duration_minutes, price_ugx, description });
      setForm({ name: '', duration: '', price: '', description: '' });
      await loadBundles();
      setSnack({ open: true, message: 'Bundle created successfully.', severity: 'success' });
    } catch (err) {
      const e = extractBackendError(err);
      setSnack({ open: true, message: e.message || 'Failed to create bundle.', severity: 'error' });
    } finally {
      setCreateLoading(false);
    }
  }

  function openEdit(bundle) {
    setEditBundleId(bundle?.id ?? null);
    setEditForm({
      name: bundle?.name ?? '',
      duration: String(bundle?.duration_minutes ?? ''),
      price: String(bundle?.price_ugx ?? ''),
      description: bundle?.description ?? '',
    });
    setEditOpen(true);
  }

  async function onSaveEdit() {
    const id = String(editBundleId ?? '').trim();
    if (!id) return;

    const name = String(editForm.name ?? '').trim();
    const duration_minutes = parseRequiredInt(editForm.duration);
    const price_ugx = parseRequiredInt(editForm.price);
    const description = String(editForm.description ?? '').trim() || null;

    if (!name) {
      setSnack({ open: true, message: 'Bundle name is required.', severity: 'error' });
      return;
    }
    if (!duration_minutes) {
      setSnack({ open: true, message: 'Duration (minutes) is required.', severity: 'error' });
      return;
    }
    if (!price_ugx) {
      setSnack({ open: true, message: 'Price (UGX) is required.', severity: 'error' });
      return;
    }

    setEditLoading(true);
    try {
      await updateBundle(id, { name, duration_minutes, price_ugx, description });
      setRows((prev) =>
        prev.map((r) =>
          String(r?.id) === String(id)
            ? { ...r, name, duration_minutes, price_ugx, description, updated_at: new Date().toISOString() }
            : r
        )
      );
      setEditOpen(false);
      await loadBundles();
      setSnack({ open: true, message: 'Bundle updated successfully.', severity: 'success' });
    } catch (err) {
      const e = extractBackendError(err);
      setSnack({ open: true, message: e.message || 'Failed to update bundle.', severity: 'error' });
    } finally {
      setEditLoading(false);
    }
  }

  async function onToggleStatus(bundle) {
    const id = String(bundle?.id ?? '').trim();
    if (!id) return;
    const isActive = Boolean(bundle?.is_active ?? true);
    const nextStatus = isActive ? 'disabled' : 'active';

    setStatusLoadingById((s) => ({ ...s, [id]: true }));
    try {
      await patchBundleStatus(id, nextStatus);
      setRows((prev) =>
        prev.map((r) =>
          String(r?.id) === String(id)
            ? { ...r, is_active: nextStatus === 'active', status: nextStatus, updated_at: new Date().toISOString() }
            : r
        )
      );
      await loadBundles();
      setSnack({ open: true, message: `Bundle ${nextStatus === 'active' ? 'enabled' : 'disabled'}.`, severity: 'success' });
    } catch (err) {
      const e = extractBackendError(err);
      setSnack({ open: true, message: e.message || 'Failed to update status.', severity: 'error' });
    } finally {
      setStatusLoadingById((s) => ({ ...s, [id]: false }));
    }
  }

  function openDelete(bundle) {
    setDeleteTarget(bundle);
    setDeleteOpen(true);
  }

  async function onConfirmDelete() {
    const id = String(deleteTarget?.id ?? '').trim();
    if (!id) return;
    setDeleteLoading(true);
    try {
      await deleteBundle(id);
      setRows((prev) => prev.filter((r) => String(r?.id) !== String(id)));
      setDeleteOpen(false);
      setDeleteTarget(null);
      await loadBundles();
      setSnack({ open: true, message: 'Bundle deleted successfully.', severity: 'success' });
    } catch (err) {
      const e = extractBackendError(err);
      setSnack({ open: true, message: e.message || 'Failed to delete bundle.', severity: 'error' });
    } finally {
      setDeleteLoading(false);
    }
  }

  const filteredRows = useMemo(() => {
    const q = String(filters.q ?? '').trim().toLowerCase();
    const status = String(filters.status ?? 'all');
    return rows.filter((r) => {
      const isActive = Boolean(r?.is_active ?? true);
      const isDeleted = Boolean(r?.is_deleted ?? false);
      if (status === 'deleted' && !isDeleted) return false;
      if (status !== 'deleted' && isDeleted) return false;
      if (status === 'active' && !isActive) return false;
      if (status === 'disabled' && isActive) return false;
      if (!q) return true;

      const hay = `${r?.id ?? ''} ${r?.name ?? ''} ${r?.description ?? ''} ${r?.mikrotik_profile ?? ''}`.toLowerCase();
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
          // Narrower left column so the right table/cards have more room on laptops.
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(360px, 440px) 1fr' },
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
              onClick={onCreate}
              disabled={createLoading}
            >
              {createLoading ? (
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <CircularProgress size={18} sx={{ color: 'white' }} />
                  <span>Creating…</span>
                </Stack>
              ) : (
                'Create Bundle'
              )}
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
                ...NEUTRAL_CHIP_SX,
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
                    <MenuItem value="deleted">Deleted</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ width: { xs: '100%', md: 200 }, pt: { xs: 0.5, xl: 2.3 } }}>
                <FormControlLabel
                  control={<Switch checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />}
                  label={<Typography variant="body2" sx={{ fontWeight: 900 }}>Show deleted</Typography>}
                />
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
                  const isDeleted = Boolean(r?.is_deleted ?? false);
                  const vouchersAvailable = r?.vouchers_available;
                  const vouchersTotal = r?.vouchers_total;
                  const vouchersLabel =
                    Number.isFinite(Number(vouchersAvailable)) && Number.isFinite(Number(vouchersTotal))
                      ? `${Number(vouchersAvailable)} / ${Number(vouchersTotal)}`
                      : '— / —';
                  const statusLoading = Boolean(statusLoadingById?.[String(r.id)]);
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
                            label={isDeleted ? 'Deleted' : isActive ? 'Active' : 'Disabled'}
                            size="small"
                            sx={{
                              ...NEUTRAL_CHIP_SX,
                              bgcolor: (theme) =>
                                theme.palette.mode === 'dark'
                                  ? '#444444'
                                  : isDeleted
                                    ? theme.palette.grey[200]
                                    : theme.palette.grey[100],
                              color: (theme) =>
                                !isDeleted && isActive
                                  ? theme.palette.success.main
                                  : theme.palette.mode === 'dark'
                                    ? theme.palette.common.white
                                    : theme.palette.text.primary,
                              flexShrink: 0,
                            }}
                          />
                        </Stack>

                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          <Chip
                            label={formatDurationBadge(r.duration_minutes)}
                            size="small"
                            sx={NEUTRAL_CHIP_SX}
                          />
                          <Chip
                            label={formatUGX(r.price_ugx)}
                            size="small"
                            sx={NEUTRAL_CHIP_SX}
                          />
                          <Chip
                            label={`Vouchers ${vouchersLabel}`}
                            size="small"
                            sx={NEUTRAL_CHIP_SX}
                          />
                        </Stack>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pt: 0.25 }}>
                          <Button
                            fullWidth
                            variant="outlined"
                            size="small"
                            sx={{ textTransform: 'none', fontWeight: 900, borderRadius: 1.25 }}
                            onClick={() => openEdit(r)}
                            disabled={isDeleted}
                          >
                            Edit
                          </Button>
                          <Button
                            fullWidth
                            variant="outlined"
                            size="small"
                            sx={{ textTransform: 'none', fontWeight: 900, borderRadius: 1.25 }}
                            onClick={() => onToggleStatus(r)}
                            disabled={statusLoading || isDeleted}
                          >
                            {statusLoading ? 'Updating…' : isActive ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            fullWidth
                            variant="outlined"
                            size="small"
                            color="error"
                            sx={{ textTransform: 'none', fontWeight: 900, borderRadius: 1.25 }}
                            onClick={() => openDelete(r)}
                            disabled={isDeleted}
                          >
                            Delete
                          </Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })
              )}
            </Box>
          ) : null}
        </Paper>
      </Box>

      {/* Edit Modal */}
      <Dialog open={editOpen} onClose={() => (editLoading ? null : setEditOpen(false))} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>Edit Bundle</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              label="Bundle Name"
              value={editForm.name}
              onChange={(e) => setEditForm((s) => ({ ...s, name: e.target.value }))}
              fullWidth
              size="small"
            />
            <TextField
              label="Duration (minutes)"
              value={editForm.duration}
              onChange={(e) => setEditForm((s) => ({ ...s, duration: e.target.value }))}
              fullWidth
              size="small"
            />
            <TextField
              label="Price (UGX)"
              value={editForm.price}
              onChange={(e) => setEditForm((s) => ({ ...s, price: e.target.value }))}
              fullWidth
              size="small"
            />
            <TextField
              label="Description"
              value={editForm.description}
              onChange={(e) => setEditForm((s) => ({ ...s, description: e.target.value }))}
              fullWidth
              size="small"
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            onClick={() => setEditOpen(false)}
            disabled={editLoading}
            sx={{ textTransform: 'none', fontWeight: 900, borderRadius: 1.5 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={onSaveEdit}
            disabled={editLoading}
            sx={{ textTransform: 'none', fontWeight: 900, borderRadius: 1.5 }}
          >
            {editLoading ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onClose={() => (deleteLoading ? null : setDeleteOpen(false))} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 900 }}>Delete Bundle</DialogTitle>
        <DialogContent sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete <strong>{deleteTarget?.name ?? 'this bundle'}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            onClick={() => setDeleteOpen(false)}
            disabled={deleteLoading}
            sx={{ textTransform: 'none', fontWeight: 900, borderRadius: 1.5 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={onConfirmDelete}
            disabled={deleteLoading}
            sx={{ textTransform: 'none', fontWeight: 900, borderRadius: 1.5 }}
          >
            {deleteLoading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

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
