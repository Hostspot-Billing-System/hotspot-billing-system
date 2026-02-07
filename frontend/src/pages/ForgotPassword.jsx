import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useMemo, useState } from 'react';
import billingLogo from '../assets/billing_logo.png';
import { api } from '../services/api.js';
import { useColorMode } from '../theme/colorMode.js';

function navigateTo(path) {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function MailIcon({ size = 54 }) {
  return (
    <Box
      component="svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      focusable="false"
      sx={{ display: 'block' }}
    >
      <rect x="8" y="14" width="48" height="36" rx="10" fill="currentColor" opacity="0.12" />
      <path
        d="M14 22c0-2.2 1.8-4 4-4h28c2.2 0 4 1.8 4 4v20c0 2.2-1.8 4-4 4H18c-2.2 0-4-1.8-4-4V22Z"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path d="M16 22l16 14 16-14" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="47" cy="17" r="9" fill="currentColor" />
      <path d="M43 17l2.5 2.5L51 14" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  );
}

export default function ForgotPassword() {
  const theme = useTheme();
  const { mode, toggleDarkMode } = useColorMode();
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
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

  async function submit() {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const addr = String(email ?? '').trim();
      setSubmittedEmail(addr);
      await api.post('/api/auth/forgot-password', { email: addr });
      setSent(true);
    } catch (e) {
      // Still show success UX to avoid enumeration.
      setSent(true);
      const msg = e?.response?.data?.error || e?.message || '';
      if (msg) setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (loading) return;
    const addr = String(submittedEmail || email || '').trim();
    setLoading(true);
    setError('');
    try {
      await api.post('/api/auth/forgot-password', { email: addr });
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || '';
      if (msg) setError(msg);
    } finally {
      setLoading(false);
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
            {!sent ? (
              <Stack spacing={2.25}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <Box component="img" src={billingLogo} alt="Omega" sx={{ width: 36, height: 36, borderRadius: 1 }} />
                    <Typography sx={{ fontWeight: 950, letterSpacing: 0.2 }}>Omega Hotspot</Typography>
                  </Box>
                </Box>

                <Stack spacing={0.5}>
                  <Typography variant="h5" sx={{ fontWeight: 950 }}>
                    Forgot your password?
                  </Typography>
                  <Typography sx={{ color: 'text.secondary' }}>
                    Enter your email address and we’ll send you a password reset link.
                  </Typography>
                </Stack>

                {error ? <Alert severity="info">{error}</Alert> : null}

                <Stack spacing={1}>
                  <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary' }}>Email Address</Typography>
                  <TextField
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    fullWidth
                    size="small"
                    disabled={loading}
                    sx={inputSx}
                    inputProps={{ inputMode: 'email', autoComplete: 'email' }}
                  />
                </Stack>

                <Button
                  variant="contained"
                  size="large"
                  onClick={submit}
                  disabled={loading || !String(email ?? '').trim()}
                  sx={{ textTransform: 'none', fontWeight: 950, py: 1.2 }}
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </Button>

                <Button
                  variant="text"
                  onClick={() => navigateTo('/admin/login')}
                  sx={{ textTransform: 'none', fontWeight: 900, color: 'text.secondary' }}
                >
                  Back to login
                </Button>
              </Stack>
            ) : (
              <Stack spacing={2.25} alignItems="center" textAlign="center">
                <Box sx={{ color: theme.palette.primary.main, mt: 1 }}>
                  <MailIcon />
                </Box>

                <Stack spacing={0.75}>
                  <Typography variant="h5" sx={{ fontWeight: 950 }}>
                    Check your Email!
                  </Typography>
                  <Typography sx={{ color: 'text.secondary' }}>
                    A password reset link has been sent to your email address. Follow the link to reset your password.
                  </Typography>
                </Stack>

                <Button
                  variant="contained"
                  size="large"
                  onClick={() => {
                    window.open('https://mail.google.com/', '_blank', 'noopener,noreferrer');
                  }}
                  sx={{ textTransform: 'none', fontWeight: 950, py: 1.2, width: '100%', maxWidth: 360 }}
                >
                  Open mail inbox
                </Button>

                <Button
                  variant="text"
                  onClick={resend}
                  disabled={loading}
                  sx={{ textTransform: 'none', fontWeight: 900 }}
                >
                  ← Resend Email
                </Button>

                <Button
                  variant="text"
                  onClick={() => navigateTo('/admin/login')}
                  sx={{ textTransform: 'none', fontWeight: 900, color: 'text.secondary' }}
                >
                  Back to login
                </Button>
              </Stack>
            )}
          </CardContent>
        </Card>

        <Typography sx={{ textAlign: 'center', mt: 3, fontSize: 12, color: 'text.secondary' }}>
          © 2026 Debesis. All Rights Reserved
        </Typography>
      </Box>
    </Box>
  );
}
