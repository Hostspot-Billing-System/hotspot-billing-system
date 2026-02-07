import { Alert, Box, Button, Card, CardContent, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useEffect, useMemo, useState } from 'react';
import billingLogo from '../assets/billing_logo.png';
import { api } from '../services/api.js';
import { useColorMode } from '../theme/colorMode.js';

function navigateTo(path) {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function getTokenFromUrl() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return String(params.get('token') ?? '');
}

function EyeIcon({ off }) {
  return (
    <Box
      component="span"
      sx={{
        width: 18,
        height: 18,
        display: 'inline-block',
        borderRadius: 1,
        border: '1.8px solid',
        borderColor: 'text.secondary',
        position: 'relative',
        opacity: off ? 0.7 : 1,
      }}
    >
      <Box
        component="span"
        sx={{
          position: 'absolute',
          left: 3,
          top: 4,
          width: 10,
          height: 7,
          borderRadius: '10px',
          border: '1.8px solid',
          borderColor: 'text.secondary',
        }}
      />
      <Box
        component="span"
        sx={{
          position: 'absolute',
          left: 8,
          top: 7,
          width: 2.5,
          height: 2.5,
          borderRadius: '50%',
          bgcolor: 'text.secondary',
        }}
      />
      {off ? (
        <Box
          component="span"
          sx={{
            position: 'absolute',
            left: -1,
            top: 8,
            width: 22,
            height: 2,
            bgcolor: 'text.secondary',
            transform: 'rotate(-20deg)',
          }}
        />
      ) : null}
    </Box>
  );
}

export default function ResetPassword() {
  const theme = useTheme();
  const { mode, toggleDarkMode } = useColorMode();

  const [token] = useState(() => getTokenFromUrl());
  const [valid, setValid] = useState(null); // null | boolean
  const [loading, setLoading] = useState(true);

  const [pw, setPw] = useState({ new_password: '', confirm_password: '' });
  const [show, setShow] = useState({ next: false, confirm: false });

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const inputSx = useMemo(() => {
    const base = theme.palette.primary.main;
    const ringShadow = `0 0 0 4px ${alpha(base, 0.16)}, 0 0 14px ${alpha(base, 0.22)}`;
    const ringShadowStrong = `0 0 0 4px ${alpha(base, 0.2)}, 0 0 18px ${alpha(base, 0.28)}`;

    return {
      '& .MuiOutlinedInput-root': {
        transition: theme.transitions.create(['box-shadow'], { duration: theme.transitions.duration.shortest }),
      },
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.mode === 'dark' ? base : theme.palette.primary.light,
        opacity: 0.45,
      },
      '&:hover .MuiOutlinedInput-notchedOutline': {
        borderColor: base,
        opacity: 0.7,
      },
      '&:hover .MuiOutlinedInput-root': {
        boxShadow: ringShadow,
      },
      '& .MuiOutlinedInput-root.Mui-focused': {
        boxShadow: ringShadowStrong,
      },
      '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
        borderColor: base,
        borderWidth: 1,
        opacity: 1,
      },
    };
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get('/api/auth/reset-password', { params: { token } });
        if (cancelled) return;
        setValid(Boolean(res?.data?.valid));
      } catch {
        if (cancelled) return;
        setValid(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/api/auth/reset-password', {
        token,
        new_password: String(pw.new_password ?? ''),
        confirm_password: String(pw.confirm_password ?? ''),
      });
      setDone(true);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to reset password';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        py: 6,
        bgcolor: theme.palette.mode === 'dark' ? '#0b1020' : '#f8fafc',
        transition: theme.transitions.create(['background-color'], { duration: theme.transitions.duration.standard }),
      }}
    >
      <Box sx={{ position: 'fixed', top: 16, right: 16, zIndex: (t) => t.zIndex.modal + 2 }}>
        <Button
          variant="outlined"
          onClick={toggleDarkMode}
          sx={{
            borderRadius: 999,
            textTransform: 'none',
            fontWeight: 800,
            px: 1.6,
            py: 0.7,
          }}
        >
          {mode === 'dark' ? 'Light mode' : 'Dark mode'}
        </Button>
      </Box>

      <Box sx={{ width: '100%', maxWidth: 520 }}>
        <Card
          elevation={0}
          sx={{
            borderRadius: 3,
            border: '1px solid',
            borderColor: theme.palette.divider,
            bgcolor: theme.palette.background.paper,
          }}
        >
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Stack spacing={2.25}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <Box component="img" src={billingLogo} alt="Omega" sx={{ width: 36, height: 36, borderRadius: 1 }} />
                  <Typography sx={{ fontWeight: 950, letterSpacing: 0.2 }}>Omega Hotspot</Typography>
                </Box>
              </Box>

              <Stack spacing={0.5}>
                <Typography variant="h5" sx={{ fontWeight: 950 }}>
                  Reset password
                </Typography>
                <Typography sx={{ color: 'text.secondary' }}>
                  Choose a new password for your account.
                </Typography>
              </Stack>

              {loading ? (
                <Alert severity="info">Validating reset link…</Alert>
              ) : null}

              {!loading && valid === false ? (
                <Alert severity="error">This reset link is invalid or has expired.</Alert>
              ) : null}

              {error ? <Alert severity="error">{error}</Alert> : null}

              {!loading && valid && !done ? (
                <>
                  <Stack spacing={1}>
                    <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary' }}>New Password</Typography>
                    <TextField
                      value={pw.new_password}
                      onChange={(e) => setPw((s) => ({ ...s, new_password: e.target.value }))}
                      fullWidth
                      size="small"
                      type={show.next ? 'text' : 'password'}
                      disabled={saving}
                      sx={inputSx}
                      helperText="Password must be at least 6 characters"
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={() => setShow((s) => ({ ...s, next: !s.next }))} edge="end">
                              <EyeIcon off={!show.next} />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Stack>

                  <Stack spacing={1}>
                    <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary' }}>Confirm New Password</Typography>
                    <TextField
                      value={pw.confirm_password}
                      onChange={(e) => setPw((s) => ({ ...s, confirm_password: e.target.value }))}
                      fullWidth
                      size="small"
                      type={show.confirm ? 'text' : 'password'}
                      disabled={saving}
                      sx={inputSx}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={() => setShow((s) => ({ ...s, confirm: !s.confirm }))} edge="end">
                              <EyeIcon off={!show.confirm} />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Stack>

                  <Button
                    variant="contained"
                    size="large"
                    onClick={submit}
                    disabled={saving}
                    sx={{ textTransform: 'none', fontWeight: 950, py: 1.2 }}
                  >
                    {saving ? 'Resetting…' : 'Reset password'}
                  </Button>
                </>
              ) : null}

              {!loading && valid && done ? (
                <Alert severity="success">Password reset successful. You can now log in with your new password.</Alert>
              ) : null}

              <Button
                variant="text"
                onClick={() => navigateTo('/admin/login')}
                sx={{ textTransform: 'none', fontWeight: 900, color: 'text.secondary' }}
              >
                Back to login
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Typography sx={{ textAlign: 'center', mt: 3, fontSize: 12, color: 'text.secondary' }}>
          © 2026 Debesis. All Rights Reserved
        </Typography>
      </Box>
    </Box>
  );
}
