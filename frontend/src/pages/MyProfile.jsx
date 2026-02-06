import { useEffect, useMemo, useState } from 'react';
import { alpha, useTheme } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  SvgIcon,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';

import { changeMyPassword, getMyProfile, updateMyProfile } from '../services/myProfile';
import { getSmsSettings, updateSmsSettings } from '../services/smsSettings';

function toBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function fmtDateShort(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTimeShort(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
        border: '1.8px solid #94a3b8',
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
          border: '1.8px solid #94a3b8',
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
          bgcolor: '#94a3b8',
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
            bgcolor: '#94a3b8',
            transform: 'rotate(-20deg)',
          }}
        />
      ) : null}
    </Box>
  );
}

function SectionIcon({ name }) {
  const common = { fontSize: 'small', sx: { color: 'text.secondary' } };
  if (name === 'edit') {
    return (
      <SvgIcon {...common} viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm2.92 2.83H5v-.92l9.06-9.06.92.92L5.92 20.08ZM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82Z"
        />
      </SvgIcon>
    );
  }
  if (name === 'lock') {
    return (
      <SvgIcon {...common} viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm-3 8V6a3 3 0 1 1 6 0v3H9Zm3 4a2 2 0 0 1 1 3.732V18a1 1 0 1 1-2 0v-1.268A2 2 0 0 1 12 13Z"
        />
      </SvgIcon>
    );
  }
  if (name === 'info') {
    return (
      <SvgIcon {...common} viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M11 17h2v-6h-2v6Zm0-8h2V7h-2v2Zm1 13C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10Zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
        />
      </SvgIcon>
    );
  }
  if (name === 'sms') {
    return (
      <SvgIcon {...common} viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M20 2H4a2 2 0 0 0-2 2v17.17L5.17 18H20a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm0 14H4.34L4 16.34V4h16v12Z"
        />
      </SvgIcon>
    );
  }
  if (name === 'settings') {
    return (
      <SvgIcon {...common} viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 12.9 1h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L1.71 7.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.23.39.32.6.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54c.04.24.25.42.49.42h3.8c.24 0 .45-.18.49-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM11 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
        />
      </SvgIcon>
    );
  }

  return null;
}

function CardTitle({ icon, title }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box sx={{ width: 18, height: 18, display: 'grid', placeItems: 'center', color: 'text.secondary' }}>{icon}</Box>
      <Typography sx={{ fontWeight: 900, color: 'text.primary' }}>{title}</Typography>
    </Stack>
  );
}

function InfoRow({ label, value, right }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 0.75 }}>
      <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 700 }}>{label}</Typography>
      {right ?? <Typography sx={{ fontSize: 13, color: 'text.primary', fontWeight: 800 }}>{value ?? '—'}</Typography>}
    </Stack>
  );
}

function useDefaultProfileForm() {
  return {
    username: '',
    email: '',
    phone_number: '',
    business_name: '',
    business_address: '',
  };
}

function useDefaultSmsForm() {
  return {
    provider: 'ugsms',
    api_username: '',
    api_password: '',
    sender_id: '',
    use_custom_api: false,
    login_otp_enabled: false,
    withdrawal_otp_enabled: false,
    customer_voucher_sms_enabled: true,
    has_api_password: false,
    updated_at: null,
    last_used_at: null,
  };
}

export default function MyProfile() {
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [savingSmsApi, setSavingSmsApi] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  const [profile, setProfile] = useState(useDefaultProfileForm());
  const [account, setAccount] = useState({
    account_status: 'Active',
    account_expires_at: null,
    time_remaining_days: null,
    commission_rate: 0.06,
    member_since: null,
    last_login_at: null,
  });

  const [sms, setSms] = useState(useDefaultSmsForm());

  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm_new_password: '' });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false, sms: false });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [p, s] = await Promise.all([getMyProfile(), getSmsSettings()]);

        if (!cancelled) {
          const pData = p?.data ?? null;
          setProfile((prev) => ({
            ...prev,
            username: String(pData?.profile?.username ?? ''),
            email: String(pData?.profile?.email ?? ''),
            phone_number: String(pData?.profile?.phone_number ?? ''),
            business_name: String(pData?.profile?.business_name ?? ''),
            business_address: String(pData?.profile?.business_address ?? ''),
          }));

          setAccount((prev) => ({
            ...prev,
            account_status: String(pData?.account?.account_status ?? 'Active'),
            account_expires_at: pData?.account?.account_expires_at ?? null,
            time_remaining_days:
              pData?.account?.time_remaining_days === 0 || pData?.account?.time_remaining_days
                ? Number(pData.account.time_remaining_days)
                : null,
            commission_rate:
              pData?.account?.commission_rate === 0 || pData?.account?.commission_rate
                ? Number(pData.account.commission_rate)
                : 0.06,
            member_since: pData?.account?.member_since ?? null,
            last_login_at: pData?.account?.last_login_at ?? null,
          }));

          const sData = s?.data ?? null;
          if (sData) {
            setSms((prev) => ({
              ...prev,
              provider: String(sData.provider ?? 'ugsms'),
              api_username: String(sData.api_username ?? ''),
              api_password: '',
              sender_id: String(sData.sender_id ?? ''),
              use_custom_api: toBool(sData.use_custom_api, false),
              login_otp_enabled: toBool(sData.login_otp_enabled, false),
              withdrawal_otp_enabled: toBool(sData.withdrawal_otp_enabled, false),
              customer_voucher_sms_enabled: toBool(sData.customer_voucher_sms_enabled, true),
              has_api_password: toBool(sData.has_api_password, false),
              updated_at: sData.updated_at ?? null,
              last_used_at: sData.last_used_at ?? null,
            }));
          }
        }
      } catch (e) {
        const msg =
          e?.response?.data?.error?.message ??
          e?.response?.data?.message ??
          e?.message ??
          'Failed to load profile';
        if (!cancelled) setSnack({ open: true, message: msg, severity: 'error' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const headerStatusChip = useMemo(() => {
    const s = String(account.account_status ?? 'Active');
    return (
      <Chip
        size="small"
        label={s}
        sx={{
          fontWeight: 900,
          bgcolor: '#16a34a',
          color: 'white',
          height: 22,
        }}
      />
    );
  }, [account.account_status]);

  const headerExpiresChip = useMemo(() => {
    const d = fmtDateShort(account.account_expires_at);
    return (
      <Chip
        size="small"
        label={account.account_expires_at ? `Expires ${d}` : 'No expiry'}
        sx={(t) => ({
          fontWeight: 800,
          bgcolor: t.palette.mode === 'dark' ? alpha(t.palette.common.white, 0.08) : '#e2e8f0',
          color: t.palette.text.primary,
          height: 22,
        })}
      />
    );
  }, [account.account_expires_at, theme.palette.mode]);

  async function onSaveProfile() {
    setSavingProfile(true);
    try {
      const res = await updateMyProfile({
        username: String(profile.username ?? '').trim(),
        email: String(profile.email ?? '').trim(),
        phone_number: String(profile.phone_number ?? '').trim(),
        business_name: String(profile.business_name ?? '').trim(),
        business_address: String(profile.business_address ?? '').trim(),
      });
      const data = res?.data ?? null;
      if (data?.profile) {
        setProfile((prev) => ({
          ...prev,
          username: String(data.profile.username ?? ''),
          email: String(data.profile.email ?? ''),
          phone_number: String(data.profile.phone_number ?? ''),
          business_name: String(data.profile.business_name ?? ''),
          business_address: String(data.profile.business_address ?? ''),
        }));
      }
      if (data?.account) setAccount((prev) => ({ ...prev, ...data.account }));
      setSnack({ open: true, message: 'Profile updated', severity: 'success' });
    } catch (e) {
      const msg = e?.response?.data?.error?.message ?? e?.message ?? 'Failed to update profile';
      setSnack({ open: true, message: msg, severity: 'error' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function onUpdatePreferences() {
    setSavingPrefs(true);
    try {
      const res = await updateSmsSettings({
        provider: 'ugsms',
        use_custom_api: Boolean(sms.use_custom_api),
        api_username: String(sms.api_username ?? '').trim(),
        sender_id: String(sms.sender_id ?? '').trim(),
        login_otp_enabled: Boolean(sms.login_otp_enabled),
        withdrawal_otp_enabled: Boolean(sms.withdrawal_otp_enabled),
        customer_voucher_sms_enabled: Boolean(sms.customer_voucher_sms_enabled),
      });
      const data = res?.data ?? null;
      setSms((prev) => ({
        ...prev,
        has_api_password: Boolean(data?.has_api_password ?? prev.has_api_password),
        updated_at: data?.updated_at ?? prev.updated_at,
        last_used_at: data?.last_used_at ?? prev.last_used_at,
      }));
      setSnack({ open: true, message: 'Preferences updated', severity: 'success' });
    } catch (e) {
      const msg = e?.response?.data?.error?.message ?? e?.message ?? 'Failed to update preferences';
      setSnack({ open: true, message: msg, severity: 'error' });
    } finally {
      setSavingPrefs(false);
    }
  }

  async function onUpdateApiConfig() {
    setSavingSmsApi(true);
    try {
      const payload = {
        provider: 'ugsms',
        use_custom_api: Boolean(sms.use_custom_api),
        api_username: String(sms.api_username ?? '').trim(),
        sender_id: String(sms.sender_id ?? '').trim(),
        login_otp_enabled: Boolean(sms.login_otp_enabled),
        withdrawal_otp_enabled: Boolean(sms.withdrawal_otp_enabled),
        customer_voucher_sms_enabled: Boolean(sms.customer_voucher_sms_enabled),
      };
      const p = String(sms.api_password ?? '').trim();
      if (p) payload.api_password = p;

      const res = await updateSmsSettings(payload);
      const data = res?.data ?? null;
      setSms((prev) => ({
        ...prev,
        api_password: '',
        has_api_password: Boolean(data?.has_api_password ?? prev.has_api_password),
        updated_at: data?.updated_at ?? prev.updated_at,
        last_used_at: data?.last_used_at ?? prev.last_used_at,
      }));
      setSnack({ open: true, message: 'API configuration updated', severity: 'success' });
    } catch (e) {
      const msg = e?.response?.data?.error?.message ?? e?.message ?? 'Failed to update API configuration';
      setSnack({ open: true, message: msg, severity: 'error' });
    } finally {
      setSavingSmsApi(false);
    }
  }

  async function onChangePassword() {
    setSavingPassword(true);
    try {
      await changeMyPassword({
        current_password: String(pw.current_password ?? ''),
        new_password: String(pw.new_password ?? ''),
        confirm_new_password: String(pw.confirm_new_password ?? ''),
      });
      setPw({ current_password: '', new_password: '', confirm_new_password: '' });
      setSnack({ open: true, message: 'Password changed', severity: 'success' });
    } catch (e) {
      const msg = e?.response?.data?.error?.message ?? e?.message ?? 'Failed to change password';
      setSnack({ open: true, message: msg, severity: 'error' });
    } finally {
      setSavingPassword(false);
    }
  }

  const smsCustomStatus = useMemo(() => {
    if (!sms.use_custom_api) {
      return {
        label: 'Status: Inactive - Using System Default',
        bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.common.white, 0.06) : '#e2e8f0',
        text: theme.palette.text.primary,
        borderColor: theme.palette.divider,
      };
    }

    return {
      label: 'Status: Active - Using Your Custom API',
      bgcolor: theme.palette.mode === 'dark' ? alpha(theme.palette.success.main, 0.12) : '#d1fae5',
      text: theme.palette.text.primary,
      borderColor: theme.palette.mode === 'dark' ? alpha(theme.palette.success.main, 0.35) : '#bbf7d0',
    };
  }, [sms.use_custom_api, theme.palette.common.white, theme.palette.divider, theme.palette.mode, theme.palette.success.main, theme.palette.text.primary]);

  return (
    <Box sx={{ width: '100%' }}>
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h5" fontWeight={900} sx={{ color: 'text.primary' }}>
              My Profile
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>
              Manage your profile information and security settings
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
            {headerStatusChip}
            {headerExpiresChip}
          </Stack>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          {/* LEFT COLUMN */}
          <Stack spacing={2}>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Stack spacing={1.5}>
                  <CardTitle
                    icon={<SectionIcon name="edit" />}
                    title="Profile Information"
                  />

                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      gap: 2,
                      mt: 0.5,
                    }}
                  >
                    <Box>
                      <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Username</Typography>
                      <TextField value={profile.username} disabled size="small" fullWidth helperText="Username cannot be changed" />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Email Address</Typography>
                      <TextField
                        value={profile.email}
                        onChange={(e) => setProfile((s) => ({ ...s, email: e.target.value }))}
                        size="small"
                        fullWidth
                        disabled={loading || savingProfile}
                      />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Phone Number</Typography>
                      <TextField
                        value={profile.phone_number}
                        onChange={(e) => setProfile((s) => ({ ...s, phone_number: e.target.value }))}
                        size="small"
                        fullWidth
                        disabled={loading || savingProfile}
                      />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Business Name</Typography>
                      <TextField
                        value={profile.business_name}
                        onChange={(e) => setProfile((s) => ({ ...s, business_name: e.target.value }))}
                        size="small"
                        fullWidth
                        disabled={loading || savingProfile}
                      />
                    </Box>
                  </Box>

                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Business Address</Typography>
                    <TextField
                      value={profile.business_address}
                      onChange={(e) => setProfile((s) => ({ ...s, business_address: e.target.value }))}
                      size="small"
                      fullWidth
                      multiline
                      minRows={3}
                      disabled={loading || savingProfile}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="contained"
                      onClick={onSaveProfile}
                      disabled={loading || savingProfile}
                      sx={{ textTransform: 'none', fontWeight: 900 }}
                    >
                      {savingProfile ? 'Updating…' : 'Update Profile'}
                    </Button>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Stack spacing={1.5}>
                  <CardTitle
                    icon={<SectionIcon name="sms" />}
                    title="SMS Notification Preferences"
                  />
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Control when you receive SMS notifications. When disabled, you'll only receive OTPs via email.
                  </Typography>

                  <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                    <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 900, color: 'text.primary' }}>Login OTP via SMS</Typography>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Receive OTP codes via SMS when logging in</Typography>
                      </Box>
                      <Switch
                        checked={Boolean(sms.login_otp_enabled)}
                        onChange={(e) => setSms((s) => ({ ...s, login_otp_enabled: e.target.checked }))}
                        disabled={loading || savingPrefs || savingSmsApi}
                      />
                    </Box>
                    <Divider />
                    <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 900, color: 'text.primary' }}>Withdrawal OTP via SMS</Typography>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Receive OTP codes via SMS when withdrawing funds</Typography>
                      </Box>
                      <Switch
                        checked={Boolean(sms.withdrawal_otp_enabled)}
                        onChange={(e) => setSms((s) => ({ ...s, withdrawal_otp_enabled: e.target.checked }))}
                        disabled={loading || savingPrefs || savingSmsApi}
                      />
                    </Box>
                    <Divider />
                    <Box
                      sx={{
                        p: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: '2px solid #2563eb',
                        borderRadius: 2,
                        m: 1.25,
                      }}
                    >
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 900, color: 'text.primary' }}>Customer Voucher SMS</Typography>
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Send voucher credentials via SMS to customers after purchase</Typography>
                      </Box>
                      <Switch
                        checked={Boolean(sms.customer_voucher_sms_enabled)}
                        onChange={(e) => setSms((s) => ({ ...s, customer_voucher_sms_enabled: e.target.checked }))}
                        disabled={loading || savingPrefs || savingSmsApi}
                      />
                    </Box>

                    <Box sx={{ px: 1.5, pb: 1.5 }}>
                      <Alert
                        severity="warning"
                        sx={(t) => ({
                          bgcolor: t.palette.mode === 'dark' ? alpha(t.palette.warning.main, 0.14) : '#fef3c7',
                          color: t.palette.text.primary,
                          border: '1px solid',
                          borderColor: t.palette.mode === 'dark' ? alpha(t.palette.warning.main, 0.35) : '#fde68a',
                        })}
                      >
                        <b>Important:</b> Disabling this means customers will NOT receive voucher SMS. They must rely on email only.
                      </Alert>
                    </Box>
                  </Box>

                  <Alert
                    severity="info"
                    sx={(t) => ({
                      bgcolor: t.palette.mode === 'dark' ? alpha(t.palette.info.main, 0.14) : '#e0f2fe',
                      border: '1px solid',
                      borderColor: t.palette.mode === 'dark' ? alpha(t.palette.info.main, 0.35) : '#bae6fd',
                      color: t.palette.text.primary,
                    })}
                  >
                    <b>Note:</b> You will always receive OTP codes via email. Customer voucher SMS settings control whether customers receive voucher credentials via SMS.
                  </Alert>

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="contained"
                      onClick={onUpdatePreferences}
                      disabled={loading || savingPrefs || savingSmsApi}
                      sx={{ textTransform: 'none', fontWeight: 900 }}
                    >
                      {savingPrefs ? 'Updating…' : 'Update Preferences'}
                    </Button>
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <CardTitle icon={<SectionIcon name="settings" />} title="Custom SMS API Configuration" />
                    <Chip
                      size="small"
                      label="Enabled by Admin"
                      sx={{ bgcolor: '#16a34a', color: 'white', fontWeight: 900, height: 22 }}
                    />
                  </Stack>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Configure your own SMS API credentials. Choose between Pandora Networks or UGSMS. When active, the system will use your API instead of the default.
                  </Typography>

                  <Alert
                    severity="info"
                    sx={(t) => ({
                      bgcolor: t.palette.mode === 'dark' ? alpha(t.palette.info.main, 0.14) : '#e0f2fe',
                      border: '1px solid',
                      borderColor: t.palette.mode === 'dark' ? alpha(t.palette.info.main, 0.35) : '#bae6fd',
                      color: t.palette.text.primary,
                    })}
                  >
                    <b>Need API credentials?</b>
                    <br />
                    <b>Pandora Networks:</b> Contact at <b>sms.thepandoranetworks.com</b> to get your API credentials.
                    <br />
                    <b>UGSMS (Recommended for faster delivery):</b> Use your account username and password from <b>ugsms.com</b>
                  </Alert>

                  <Alert
                    severity="success"
                    sx={{
                      bgcolor: smsCustomStatus.bgcolor,
                      border: '1px solid',
                      borderColor: smsCustomStatus.borderColor,
                      color: smsCustomStatus.text,
                    }}
                  >
                    <b>{smsCustomStatus.label}</b>
                    <br />
                    All SMS will be sent using your custom API credentials
                  </Alert>

                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>SMS Provider</Typography>
                    <FormControl size="small" fullWidth>
                      <Select
                        value="UGSMS"
                        disabled
                        renderValue={() => 'UGSMS'}
                      >
                        <MenuItem value="UGSMS">UGSMS</MenuItem>
                      </Select>
                    </FormControl>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>Select your SMS provider</Typography>
                  </Box>

                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>SMS API Username</Typography>
                    <TextField
                      value={sms.api_username}
                      onChange={(e) => setSms((s) => ({ ...s, api_username: e.target.value }))}
                      size="small"
                      fullWidth
                      disabled={loading || savingSmsApi}
                    />
                  </Box>

                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>SMS API Password</Typography>
                    <TextField
                      value={sms.api_password}
                      onChange={(e) => setSms((s) => ({ ...s, api_password: e.target.value }))}
                      size="small"
                      fullWidth
                      placeholder={sms.has_api_password ? 'Leave blank to keep current password' : ''}
                      type={showPw.sms ? 'text' : 'password'}
                      disabled={loading || savingSmsApi}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={() => setShowPw((s) => ({ ...s, sms: !s.sms }))} edge="end">
                              <EyeIcon off={!showPw.sms} />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>Leave blank to keep current password</Typography>
                  </Box>

                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Sender ID</Typography>
                    <TextField
                      value={sms.sender_id}
                      onChange={(e) => setSms((s) => ({ ...s, sender_id: e.target.value }))}
                      size="small"
                      fullWidth
                      disabled={loading || savingSmsApi}
                    />
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>Maximum 11 characters, will appear as SMS sender</Typography>
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="contained"
                      onClick={onUpdateApiConfig}
                      disabled={loading || savingSmsApi}
                      sx={{ textTransform: 'none', fontWeight: 900 }}
                    >
                      {savingSmsApi ? 'Updating…' : 'Update API Configuration'}
                    </Button>
                  </Box>

                  <Divider />

                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 900, color: 'text.primary' }}>Use Custom SMS API</Typography>
                      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Activate to use your API, deactivate to use system default</Typography>
                    </Box>
                    <Switch
                      checked={Boolean(sms.use_custom_api)}
                      onChange={(e) => setSms((s) => ({ ...s, use_custom_api: e.target.checked }))}
                      disabled={loading || savingSmsApi || savingPrefs}
                    />
                  </Stack>

                  <Stack spacing={0.25} sx={{ color: 'text.secondary', fontSize: 12 }}>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                      Last used: {fmtDateTimeShort(sms.last_used_at)}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                      Configured: {fmtDateTimeShort(sms.updated_at)}
                    </Typography>
                  </Stack>

                  <Alert
                    severity="info"
                    sx={(t) => ({
                      bgcolor: t.palette.mode === 'dark' ? alpha(t.palette.common.white, 0.04) : '#f8fafc',
                      border: '1px solid',
                      borderColor: 'divider',
                      color: t.palette.text.primary,
                    })}
                  >
                    <b>Need API credentials?</b>
                    <br />
                    Contact Pandora Networks at <b>sms.thepandoranetworks.com</b> to get your API credentials.
                  </Alert>
                </Stack>
              </CardContent>
            </Card>
          </Stack>

          {/* RIGHT COLUMN */}
          <Stack spacing={2}>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Stack spacing={1.5}>
                  <CardTitle icon={<SectionIcon name="lock" />} title="Change Password" />

                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Current Password</Typography>
                    <TextField
                      value={pw.current_password}
                      onChange={(e) => setPw((s) => ({ ...s, current_password: e.target.value }))}
                      size="small"
                      fullWidth
                      type={showPw.current ? 'text' : 'password'}
                      disabled={loading || savingPassword}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={() => setShowPw((s) => ({ ...s, current: !s.current }))} edge="end">
                              <EyeIcon off={!showPw.current} />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Box>

                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>New Password</Typography>
                    <TextField
                      value={pw.new_password}
                      onChange={(e) => setPw((s) => ({ ...s, new_password: e.target.value }))}
                      size="small"
                      fullWidth
                      type={showPw.next ? 'text' : 'password'}
                      disabled={loading || savingPassword}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={() => setShowPw((s) => ({ ...s, next: !s.next }))} edge="end">
                              <EyeIcon off={!showPw.next} />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                      helperText="Password must be at least 6 characters"
                    />
                  </Box>

                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 900, color: 'text.primary', mb: 0.75 }}>Confirm New Password</Typography>
                    <TextField
                      value={pw.confirm_new_password}
                      onChange={(e) => setPw((s) => ({ ...s, confirm_new_password: e.target.value }))}
                      size="small"
                      fullWidth
                      type={showPw.confirm ? 'text' : 'password'}
                      disabled={loading || savingPassword}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={() => setShowPw((s) => ({ ...s, confirm: !s.confirm }))} edge="end">
                              <EyeIcon off={!showPw.confirm} />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Box>

                  <Button
                    variant="contained"
                    fullWidth
                    onClick={onChangePassword}
                    disabled={loading || savingPassword}
                    sx={{ textTransform: 'none', fontWeight: 900, mt: 0.5 }}
                  >
                    {savingPassword ? 'Changing…' : 'Change Password'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Stack spacing={1.25}>
                  <CardTitle icon={<SectionIcon name="info" />} title="Account Information" />

                  <InfoRow
                    label="Account Status"
                    right={
                      <Chip
                        size="small"
                        label={String(account.account_status ?? 'Active')}
                        sx={{ bgcolor: '#16a34a', color: 'white', fontWeight: 900, height: 22 }}
                      />
                    }
                  />
                  <Divider />
                  <InfoRow label="Account Expires" value={fmtDateTimeShort(account.account_expires_at)} />
                  <Divider />
                  <InfoRow
                    label="Time Remaining"
                    right={
                      <Chip
                        size="small"
                        label={
                          account.time_remaining_days == null
                            ? '—'
                            : `${Number(account.time_remaining_days)} day(s) left`
                        }
                        sx={{ bgcolor: '#06b6d4', color: 'white', fontWeight: 900, height: 22 }}
                      />
                    }
                  />
                  <Divider />
                  <InfoRow
                    label="Commission Rate"
                    right={
                      <Chip
                        size="small"
                        label={`${(Number(account.commission_rate ?? 0.06) * 100).toFixed(1)}%`}
                        sx={{ bgcolor: '#0ea5e9', color: 'white', fontWeight: 900, height: 22 }}
                      />
                    }
                  />
                  <Divider />
                  <InfoRow label="Member Since" value={fmtDateShort(account.member_since)} />
                  <Divider />
                  <InfoRow label="Last Login" value={fmtDateShort(account.last_login_at)} />
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Box>

        <Snackbar
          open={snack.open}
          autoHideDuration={4500}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert severity={snack.severity} sx={{ width: '100%' }}>
            {snack.message}
          </Alert>
        </Snackbar>
      </Stack>
    </Box>
  );
}
