import { Alert, Box, Button, Card, CardContent, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { alpha, useTheme } from '@mui/material/styles';
import { login, getSession } from '../services/auth.service.js';
import FullPageLoader from '../components/FullPageLoader.jsx';
import billingLogo from '../assets/billing_logo.png';
import { useColorMode } from '../theme/colorMode.js';

function navigateTo(path) {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function fmtMMSS(totalSeconds) {
  const s = Math.max(0, Number(totalSeconds) || 0);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(Math.floor(s % 60)).padStart(2, '0');
  return `${mm}:${ss}`;
}

function ArrowLeftIcon({ size = 14 }) {
  return (
    <Box
      component="svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      sx={{ display: 'block' }}
    >
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  );
}

function RefreshIcon({ size = 14 }) {
  return (
    <Box
      component="svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      sx={{ display: 'block' }}
    >
      <path
        d="M20 12a8 8 0 1 1-2.34-5.66"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  );
}

function ClockIcon({ size = 14 }) {
  return (
    <Box
      component="svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      sx={{ display: 'block' }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  );
}

function CheckCircleIcon({ size = 16 }) {
  return (
    <Box
      component="svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      sx={{ display: 'block' }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 12.2 11 14.7 15.5 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  );
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

export default function AdminLogin() {
  const theme = useTheme();
  const { mode, toggleDarkMode } = useColorMode();
  const [step, setStep] = useState('login'); // 'login' | 'otp'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState(() => Array(6).fill(''));
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [otpExpiresAt, setOtpExpiresAt] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const otpInputRefs = useRef([]);

  const otpValue = useMemo(() => otp.join(''), [otp]);

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

  const canSubmitLogin = useMemo(() => {
    return username.trim().length > 0 && password.length > 0;
  }, [username, password]);

  const canSubmitOtp = useMemo(() => {
    return username.trim().length > 0 && /^\d{6}$/.test(otpValue);
  }, [username, otpValue]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await getSession();
        if (cancelled) return;
        if (res?.isAuthenticated) {
          navigateTo('/admin/dashboard');
        }
      } catch {
        // ignore
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmitLogin(e) {
    e.preventDefault();
    if (!canSubmitLogin || loading) return;

    setLoading(true);
    setError('');
    setVerifying(false);
    try {
      const res = await login({ username: username.trim(), password });
      const requiresOtp = res?.requiresOtp === true || res?.requires_verification === true;
      if (res?.success && requiresOtp) {
        setStep('otp');
        setOtp(Array(6).fill(''));
        setOtpExpiresAt(Date.now() + 10 * 60 * 1000);
        setNowMs(Date.now());
      } else if (res?.success && (res?.requiresOtp === false || res?.requires_verification === false)) {
        navigateTo('/admin/dashboard');
      } else {
        setError(res?.error || 'Login failed');
      }
    } catch (err) {
      setError(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  function onForgotPassword() {
    navigateTo('/forgot-password');
  }

  async function onSubmitOtp(e) {
    e.preventDefault();
    if (!canSubmitOtp || loading) return;

    setLoading(true);
    setVerifying(true);
    setError('');
    try {
      const res = await api.post('/api/auth/verify-otp', {
        email: 'ntivuguruzwaphilemon0@gmail.com',
        otp: otpValue,
      });

      if (res?.data?.success) {
        navigateTo('/admin/dashboard');
        return;
      }

      setError(res?.data?.error || 'Verification failed');
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Verification failed';
      setError(msg);
    } finally {
      setLoading(false);
      setVerifying(false);
    }
  }

  async function onResendOtp() {
    if (resending || loading) return;
    if (!username.trim() || !password) {
      setError('Please go back and enter your username and password.');
      return;
    }

    setResending(true);
    setError('');
    try {
      const res = await api.post('/api/auth/resend-otp', {
        username: username.trim(),
        password,
      });

      if (res?.data?.success) {
        setOtp(Array(6).fill(''));
        setOtpExpiresAt(Date.now() + 10 * 60 * 1000);
        setNowMs(Date.now());
        return;
      }

      setError(res?.data?.error || 'Failed to resend code');
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to resend code';
      setError(msg);
    } finally {
      setResending(false);
    }
  }

  const expiresInSeconds = useMemo(() => {
    if (!otpExpiresAt) return 0;
    return Math.max(0, Math.ceil((otpExpiresAt - nowMs) / 1000));
  }, [nowMs, otpExpiresAt]);

  useEffect(() => {
    if (step !== 'otp' || !otpExpiresAt) return;

    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(id);
  }, [otpExpiresAt, step]);

  if (verifying && step === 'otp') {
    return <FullPageLoader />;
  }

  return (
    <>
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 2,
          background: theme.palette.background.default,
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

        <Box sx={{ width: '100%', maxWidth: 340 }}>
          <Card
            sx={{
              width: '100%',
              maxWidth: 340,
              mx: 'auto',
              borderRadius: 2,
              boxShadow: theme.shadows[2],
              backgroundColor: theme.palette.background.paper,
            }}
          >
            <CardContent sx={{ p: step === 'login' ? 4 : 4.5 }}>
              {step === 'login' ? (
                <Stack spacing={2}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography
                      sx={{
                        fontSize: 26,
                        fontWeight: 800,
                        lineHeight: 1.15,
                        color: theme.palette.text.primary,
                      }}
                    >
                      Login
                    </Typography>

                    <Typography sx={{ mt: 0.75, fontSize: 13, color: theme.palette.text.secondary }}>
                      Welcome back! Please login to your account.
                    </Typography>
                  </Box>

                  {error ? <Alert severity="error">{error}</Alert> : null}

                  <Box component="form" onSubmit={onSubmitLogin}>
                    <Stack spacing={1.6}>
                      <TextField
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        label="Username"
                        fullWidth
                        size="small"
                        sx={inputSx}
                      />

                      <TextField
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        label="Password"
                        fullWidth
                        size="small"
                        sx={inputSx}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={() => setShowPassword((s) => !s)}
                                edge="end"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                              >
                                <EyeIcon off={!showPassword} />
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />

                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -0.5 }}>
                        <Button
                          variant="text"
                          onClick={onForgotPassword}
                          sx={{
                            textTransform: 'none',
                            fontWeight: 700,
                            px: 0,
                            minWidth: 0,
                            color: theme.palette.text.secondary,
                          }}
                        >
                          Forgot password?
                        </Button>
                      </Box>

                      <Button
                        type="submit"
                        variant="contained"
                        disabled={!canSubmitLogin || loading}
                        fullWidth
                        sx={{
                          mt: 0.75,
                          py: 1.15,
                          borderRadius: 2,
                          textTransform: 'none',
                          fontWeight: 700,
                        }}
                      >
                        {loading ? 'Login' : 'Login'}
                      </Button>
                    </Stack>
                  </Box>
                </Stack>
              ) : (
                <Stack spacing={2.25} sx={{ textAlign: 'center' }}>
                <Box
                  component="img"
                  src={billingLogo}
                  alt=""
                  aria-hidden="true"
                  sx={{
                    width: 64,
                    height: 64,
                    objectFit: 'contain',
                    mx: 'auto',
                    alignSelf: 'center',
                    display: 'block',
                  }}
                />

                <Box>
                  <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>
                    Verify Your Login
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.75, maxWidth: 320, mx: 'auto' }}
                  >
                    We've sent a 6-digit verification code to your registered phone and email address.
                  </Typography>
                </Box>

                {error ? <Alert severity="error" sx={{ textAlign: 'left' }}>{error}</Alert> : null}

                <Box component="form" onSubmit={onSubmitOtp}>
                  <Stack spacing={2}>
                    <Stack direction="row" spacing={1.1} justifyContent="center">
                      {Array.from({ length: 6 }).map((_, idx) => (
                        <TextField
                          key={idx}
                          value={otp[idx]}
                          inputRef={(el) => {
                            otpInputRefs.current[idx] = el;
                          }}
                          onChange={(e) => {
                            const raw = String(e.target.value ?? '');
                            const digits = raw.replace(/\D/g, '');

                            if (!digits) {
                              setOtp((prev) => {
                                const next = [...prev];
                                next[idx] = '';
                                return next;
                              });
                              return;
                            }

                            setOtp((prev) => {
                              const next = [...prev];
                              let writeAt = idx;
                              for (const ch of digits) {
                                if (writeAt > 5) break;
                                next[writeAt] = ch;
                                writeAt += 1;
                              }
                              return next;
                            });

                            const nextIndex = Math.min(5, idx + digits.length);
                            const el = otpInputRefs.current[nextIndex];
                            if (el) {
                              el.focus();
                              el.select?.();
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
                              const el = otpInputRefs.current[idx - 1];
                              if (el) {
                                el.focus();
                                el.select?.();
                              }
                            }
                            if (e.key === 'ArrowLeft' && idx > 0) {
                              const el = otpInputRefs.current[idx - 1];
                              if (el) {
                                el.focus();
                                el.select?.();
                              }
                            }
                            if (e.key === 'ArrowRight' && idx < 5) {
                              const el = otpInputRefs.current[idx + 1];
                              if (el) {
                                el.focus();
                                el.select?.();
                              }
                            }
                          }}
                          onPaste={(e) => {
                            const text = e.clipboardData?.getData('text') ?? '';
                            const digits = String(text).replace(/\D/g, '').slice(0, 6);
                            if (!digits) return;

                            e.preventDefault();
                            setOtp(() => {
                              const next = Array(6).fill('');
                              for (let i = 0; i < digits.length; i += 1) next[i] = digits[i];
                              return next;
                            });

                            const focusIndex = Math.min(5, digits.length);
                            const el = otpInputRefs.current[focusIndex];
                            if (el) {
                              el.focus();
                              el.select?.();
                            }
                          }}
                          inputMode="numeric"
                          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                          placeholder=""
                          autoFocus={idx === 0}
                          size="small"
                          sx={{
                            width: 56,
                            '& .MuiOutlinedInput-root': {
                              height: 60,
                              borderRadius: 2,
                              px: 0,
                            },
                            '& input': {
                              textAlign: 'center',
                              fontSize: 22,
                              fontWeight: 800,
                              padding: 0,
                            },
                            ...inputSx,
                          }}
                          inputProps={{ maxLength: 1 }}
                        />
                      ))}
                    </Stack>

                    <Button
                      type="submit"
                      variant="contained"
                      disabled={!canSubmitOtp || loading}
                      fullWidth
                      startIcon={<CheckCircleIcon />}
                      sx={{
                        py: 1.15,
                        textTransform: 'uppercase',
                        fontWeight: 800,
                        letterSpacing: 0.2,
                      }}
                    >
                      {loading ? 'VERIFYING…' : 'VERIFY CODE'}
                    </Button>
                  </Stack>
                </Box>

                <Box sx={{ pt: 0.5 }}>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.75,
                      color: theme.palette.error.main,
                      fontSize: 12.5,
                      fontWeight: 600,
                    }}
                  >
                    <ClockIcon />
                    <span>Code expires in {fmtMMSS(expiresInSeconds)}</span>
                  </Box>
                </Box>

                <Box sx={{ fontSize: 12.5, color: theme.palette.text.secondary }}>
                  <Box component="span">Didn't receive the code? </Box>
                  <Button
                    type="button"
                    variant="text"
                    disabled={resending || loading}
                    onClick={onResendOtp}
                    startIcon={<RefreshIcon />}
                    sx={{
                      p: 0,
                      minWidth: 'auto',
                      verticalAlign: 'baseline',
                      textTransform: 'none',
                      fontWeight: 700,
                    }}
                  >
                    {resending ? 'Resending…' : 'Resend Code'}
                  </Button>
                </Box>

                <Button
                  type="button"
                  variant="text"
                  disabled={loading}
                  fullWidth
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    color: theme.palette.text.secondary,
                    mt: 0.5,
                  }}
                  startIcon={<ArrowLeftIcon />}
                  onClick={() => {
                    setStep('login');
                    setOtp(Array(6).fill(''));
                    setError('');
                    setOtpExpiresAt(null);
                    setNowMs(Date.now());
                  }}
                >
                  Back to Login
                </Button>
              </Stack>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>
    </>
  );
}
