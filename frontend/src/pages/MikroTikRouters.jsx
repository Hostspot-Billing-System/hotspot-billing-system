import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { alpha } from '@mui/material/styles';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import { createRouter, deleteRouter, listRouters, testRouter } from '../services/routers';

function statusColor(status) {
  const s = String(status ?? 'unknown').toLowerCase();
  if (s === 'online') return { label: 'Online', bg: '#16a34a' };
  if (s === 'offline') return { label: 'Offline', bg: '#dc2626' };
  return { label: 'Unknown', bg: '#94a3b8' };
}

function extractBackendFieldErrors(err) {
  const fields = err?.response?.data?.error?.fields;
  if (fields && typeof fields === 'object') return fields;
  return null;
}

function extractBackendError(err) {
  const data = err?.response?.data;
  const code = data?.error?.code ?? 'REQUEST_FAILED';
  const message = data?.error?.message ?? err?.message ?? 'Request failed';
  return { code, message };
}

const DEFAULT_PORTS = {
  api_port: 8728,
  winbox_port: 8291,
  web_port: 80,
  https_port: 443,
};

function isValidHost(host) {
  const v = String(host ?? '').trim();
  if (!v) return false;
  if (v.includes('://')) return false;
  if (v.includes('/')) return false;
  if (v.includes(':')) return false;
  return /^[a-zA-Z0-9.-]+$/.test(v);
}

function AccessInfo({ host, username, api_port, winbox_port, web_port, https_port }) {
  const safeHost = String(host ?? '').trim();
  const u = String(username ?? '').trim();

  const items = [
    { label: 'Winbox', value: safeHost ? `${safeHost}:${winbox_port || DEFAULT_PORTS.winbox_port}` : '{host}:{winbox_port}' },
    { label: 'WebFig', value: safeHost ? `http://${safeHost}:${web_port || DEFAULT_PORTS.web_port}` : 'http://{host}:{web_port}' },
    { label: 'SSH', value: safeHost ? `ssh ${u || '{username}'}@${safeHost} -p 10114` : 'ssh {username}@{host} -p 10114' },
    { label: 'API', value: safeHost ? `${safeHost}:${api_port || DEFAULT_PORTS.api_port}` : '{host}:{api_port}' },
    { label: 'API-SSL', value: safeHost ? `ssl://${safeHost}:${https_port || DEFAULT_PORTS.https_port}` : 'ssl://{host}:{https_port}' },
  ];

  return (
    <Box
      sx={{
        mt: 2,
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: (t) => (t.palette.mode === 'dark' ? alpha(t.palette.info.main, 0.35) : '#bae6fd'),
        bgcolor: (t) => (t.palette.mode === 'dark' ? alpha(t.palette.info.main, 0.12) : '#e0f2fe'),
      }}
    >
      <Typography sx={{ fontWeight: 900, fontSize: 13, color: 'text.primary', mb: 0.75 }}>
        Router Access Information:
      </Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>
        Once added, the assigned owner will have access to:
      </Typography>
      <Box component="ul" sx={{ pl: 2.2, m: 0, color: 'text.secondary' }}>
        {items.map((i) => (
          <Box component="li" key={i.label} sx={{ fontSize: 12, mb: 0.4 }}>
            <b>{i.label}:</b> {i.value}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function Banner() {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 2.5,
        border: '1px solid #dbeafe',
        bgcolor: '#0b65f2',
        color: 'white',
      }}
    >
      <Stack spacing={1.25}>
        <Box>
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1,
              py: 0.45,
              borderRadius: 1,
              bgcolor: '#fbbf24',
              color: '#0f172a',
              fontSize: 11,
              fontWeight: 900,
              mb: 1,
            }}
          >
            ☆ NEW FEATURE
          </Box>
          <Typography sx={{ fontWeight: 900, fontSize: 18 }}>Remote MikroTik Access</Typography>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 1,
            color: 'rgba(255,255,255,0.92)',
            fontSize: 13,
          }}
        >
          <Stack spacing={0.6}>
            <Box>Control your MikroTik routers from anywhere! No need to be on-site anymore.</Box>
            <Box>Real-time monitoring</Box>
            <Box>Secure API connection</Box>
          </Stack>
          <Stack spacing={0.6}>
            <Box>Access from any device</Box>
            <Box>24/7 remote management</Box>
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}

function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', onClose, onConfirm, busy }) {
  return (
    <Dialog open={open} onClose={() => (busy ? null : onClose?.())} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 900 }}>{title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>{description}</Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => onClose?.()} disabled={busy} variant="outlined">
          Cancel
        </Button>
        <Button onClick={() => onConfirm?.()} disabled={busy} color="error" variant="contained">
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddRouterModal({ open, onClose, onCreated }) {
  const [values, setValues] = useState({
    name: '',
    host: '',
    description: '',
    username: '',
    password: '',
    ...DEFAULT_PORTS,
  });

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setValues({
      name: '',
      host: '',
      description: '',
      username: '',
      password: '',
      ...DEFAULT_PORTS,
    });
    setErrors({});
    setSubmitting(false);
  }, [open]);

  function setField(field, next) {
    setValues((v) => ({ ...v, [field]: next }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate() {
    const next = {};
    if (!values.name.trim()) next.name = 'Router Name is required';
    if (!values.host.trim() || !isValidHost(values.host)) next.host = 'Enter hostname/IP only (no protocol/port)';
    if (!values.username.trim()) next.username = 'Username is required';
    if (!values.password) next.password = 'Password is required';

    const portKeys = ['api_port', 'winbox_port', 'web_port', 'https_port'];
    for (const k of portKeys) {
      const n = Number(values[k]);
      if (!Number.isFinite(n)) next[k] = 'Port must be numeric';
      else if (n <= 0 || n > 65535) next[k] = 'Port must be 1-65535';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        name: values.name.trim(),
        host: values.host.trim(),
        description: values.description.trim(),
        username: values.username.trim(),
        password: values.password,
        api_port: Number(values.api_port),
        winbox_port: Number(values.winbox_port),
        web_port: Number(values.web_port),
        https_port: Number(values.https_port),
      };

      const res = await createRouter(payload);
      onCreated?.(res?.data?.data);
      onClose?.();
    } catch (err) {
      const fieldErrors = extractBackendFieldErrors(err);
      if (fieldErrors) {
        setErrors((e) => ({ ...e, ...fieldErrors }));
      } else {
        // Keep inline style: surface a generic error at top.
        setErrors((e) => ({ ...e, _form: extractBackendError(err).message }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => (submitting ? null : onClose?.())} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Add MikroTik Router
        <IconButton onClick={() => (submitting ? null : onClose?.())} size="small" aria-label="Close">
          <Box component="span" sx={{ fontSize: 18, lineHeight: '18px' }}>
            ×
          </Box>
        </IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2.5 }}>
        {errors._form ? (
          <Box
            sx={{
              mb: 2,
              p: 1.25,
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: (t) => (t.palette.mode === 'dark' ? alpha(t.palette.error.main, 0.4) : '#fecaca'),
              bgcolor: (t) => (t.palette.mode === 'dark' ? alpha(t.palette.error.main, 0.12) : '#fef2f2'),
            }}
          >
            <Typography sx={{ fontWeight: 900, color: 'error.main', fontSize: 13 }}>Error</Typography>
            <Typography sx={{ color: 'error.main', fontSize: 13 }}>{errors._form}</Typography>
          </Box>
        ) : null}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 2,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Router Name *</Typography>
            <TextField
              value={values.name}
              onChange={(e) => setField('name', e.target.value)}
              size="small"
              fullWidth
              error={Boolean(errors.name)}
              helperText={errors.name || ' '}
            />
          </Box>

          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Host/IP Address *</Typography>
            <TextField
              value={values.host}
              onChange={(e) => setField('host', e.target.value)}
              size="small"
              fullWidth
              placeholder="e.g., 192.168.1.1 or example.com"
              error={Boolean(errors.host)}
              helperText={errors.host || 'Enter IP address or hostname only (without port)'}
            />
          </Box>

          <Box sx={{ gridColumn: { xs: '1 / -1', md: '1 / -1' } }}>
            <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Description</Typography>
            <TextField
              value={values.description}
              onChange={(e) => setField('description', e.target.value)}
              size="small"
              fullWidth
              multiline
              minRows={2}
              error={Boolean(errors.description)}
              helperText={errors.description || ' '}
            />
          </Box>

          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Username *</Typography>
            <TextField
              value={values.username}
              onChange={(e) => setField('username', e.target.value)}
              size="small"
              fullWidth
              error={Boolean(errors.username)}
              helperText={errors.username || ' '}
            />
          </Box>

          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Password *</Typography>
            <TextField
              value={values.password}
              onChange={(e) => setField('password', e.target.value)}
              size="small"
              fullWidth
              type="password"
              error={Boolean(errors.password)}
              helperText={errors.password || ' '}
            />
          </Box>
        </Box>

        <Box sx={{ mt: 1.5 }}>
          <Typography sx={{ fontWeight: 900, fontSize: 12, color: 'text.primary', mb: 1 }}>Port Configuration</Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>API Port</Typography>
              <TextField
                value={values.api_port}
                onChange={(e) => setField('api_port', e.target.value)}
                size="small"
                fullWidth
                error={Boolean(errors.api_port)}
                helperText={errors.api_port || 'Default: 8728'}
              />
            </Box>

            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Winbox Port</Typography>
              <TextField
                value={values.winbox_port}
                onChange={(e) => setField('winbox_port', e.target.value)}
                size="small"
                fullWidth
                error={Boolean(errors.winbox_port)}
                helperText={errors.winbox_port || 'Default: 8291'}
              />
            </Box>

            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Web Port (HTTP)</Typography>
              <TextField
                value={values.web_port}
                onChange={(e) => setField('web_port', e.target.value)}
                size="small"
                fullWidth
                error={Boolean(errors.web_port)}
                helperText={errors.web_port || 'Default: 80'}
              />
            </Box>

            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>HTTPS Port</Typography>
              <TextField
                value={values.https_port}
                onChange={(e) => setField('https_port', e.target.value)}
                size="small"
                fullWidth
                error={Boolean(errors.https_port)}
                helperText={errors.https_port || 'Default: 443'}
              />
            </Box>
          </Box>

          <AccessInfo
            host={values.host}
            username={values.username}
            api_port={Number(values.api_port)}
            winbox_port={Number(values.winbox_port)}
            web_port={Number(values.web_port)}
            https_port={Number(values.https_port)}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => onClose?.()} disabled={submitting} variant="outlined">
          Cancel
        </Button>
        <Button onClick={submit} disabled={submitting} variant="contained">
          Add Router
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function MikroTikRouters() {
  const [routers, setRouters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [testingId, setTestingId] = useState(null);

  const empty = routers.length === 0;

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listRouters();
      setRouters(res?.data?.data?.rows ?? []);
    } catch (err) {
      setError(extractBackendError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      refresh();
    }, 25000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const routerCards = useMemo(() => routers, [routers]);

  async function onTest(id) {
    setTestingId(id);
    try {
      await testRouter(id);
      await refresh();
    } catch (err) {
      setError(extractBackendError(err));
    } finally {
      setTestingId(null);
    }
  }

  async function onDeleteConfirmed() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteRouter(deleteId);
      setDeleteId(null);
      await refresh();
    } catch (err) {
      setError(extractBackendError(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Box sx={{ width: '100%', pt: { xs: 0.5, sm: 1 }, pb: { xs: 2, sm: 3 }, px: 0 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900, color: 'text.primary' }}>
            MikroTik Management
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 13, mt: 0.5 }}>
            Add and manage your MikroTik routers for remote access and monitoring
          </Typography>
        </Box>

        <Banner />

        <Paper
          elevation={0}
          sx={{ p: 2, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
        >
          <Stack spacing={1.25}>
            <Typography sx={{ fontWeight: 900, color: 'text.primary' }}>Quick Actions</Typography>
            <Box>
              <Button variant="contained" onClick={() => setAddOpen(true)} sx={{ textTransform: 'none', fontWeight: 900 }}>
                + Add Router
              </Button>
            </Box>
          </Stack>
        </Paper>

        {error ? (
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: (t) => (t.palette.mode === 'dark' ? alpha(t.palette.error.main, 0.4) : '#fecaca'),
              bgcolor: (t) => (t.palette.mode === 'dark' ? alpha(t.palette.error.main, 0.12) : '#fef2f2'),
            }}
          >
            <Typography sx={{ fontWeight: 900, color: 'error.main' }}>{error.code}</Typography>
            <Typography sx={{ color: 'error.main' }}>{error.message}</Typography>
          </Paper>
        ) : null}

        <Paper
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: (t) => (t.palette.mode === 'dark' ? alpha(t.palette.info.main, 0.35) : '#bae6fd'),
            bgcolor: (t) => (t.palette.mode === 'dark' ? alpha(t.palette.info.main, 0.1) : '#ecfeff'),
          }}
        >
          <Typography sx={{ fontSize: 13, color: 'text.primary' }}>
            <b>Remote Access Ready!</b> Your routers can now be accessed and controlled from anywhere in the world. No VPN or local network required.
          </Typography>
        </Paper>

        <Box>
          <Typography sx={{ fontWeight: 900, color: 'text.primary', mb: 1 }}>
            Your Routers ({routers.length})
          </Typography>

          {empty ? (
            <Paper
              elevation={0}
              sx={{
                p: 6,
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                textAlign: 'center',
              }}
            >
              <Typography sx={{ fontWeight: 900, color: 'text.primary', mb: 0.5 }}>No routers configured</Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 13, mb: 2 }}>
                Add your first MikroTik router to get started
              </Typography>
              <Button variant="contained" onClick={() => setAddOpen(true)} sx={{ textTransform: 'none', fontWeight: 900 }}>
                + Add Router
              </Button>
            </Paper>
          ) : (
            <Stack spacing={1.5}>
              {routerCards.map((r) => {
                const badge = statusColor(r.status);
                return (
                  <Paper
                    key={r.id}
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: 2.5,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr 1fr auto' },
                        gap: 1.25,
                        alignItems: 'center',
                      }}
                    >
                      <Box>
                        <Typography sx={{ fontWeight: 900, color: 'text.primary' }}>{r.name}</Typography>
                        <Typography sx={{ color: 'text.secondary', fontSize: 13 }}>{r.host}</Typography>
                      </Box>

                      <Box>
                        <Chip
                          label={badge.label}
                          size="small"
                          sx={{ bgcolor: badge.bg, color: 'white', fontWeight: 900, minWidth: 92, justifyContent: 'center' }}
                        />
                      </Box>

                      <Box>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Last checked</Typography>
                        <Typography sx={{ fontSize: 13, color: 'text.primary', fontWeight: 800 }}>
                          {r.last_checked ? dayjs(r.last_checked).format('YYYY-MM-DD HH:mm') : '—'}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1} justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
                        <Button
                          variant="outlined"
                          onClick={() => onTest(r.id)}
                          disabled={testingId === r.id || loading}
                          sx={{ textTransform: 'none', fontWeight: 900 }}
                        >
                          {testingId === r.id ? 'Testing…' : 'Test Connection'}
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          onClick={() => setDeleteId(r.id)}
                          disabled={loading}
                          sx={{ textTransform: 'none', fontWeight: 900 }}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </Box>
                  </Paper>
                );
              })}
            </Stack>
          )}

          {loading ? (
            <Typography sx={{ mt: 1.5, color: 'text.secondary', fontSize: 13 }}>Loading routers…</Typography>
          ) : null}
        </Box>

        <AddRouterModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            refresh();
          }}
        />

        <ConfirmDialog
          open={Boolean(deleteId)}
          title="Delete Router"
          description="This will remove the router configuration from the system. This action cannot be undone."
          confirmLabel="Delete"
          busy={deleting}
          onClose={() => setDeleteId(null)}
          onConfirm={onDeleteConfirmed}
        />
      </Stack>
    </Box>
  );
}
