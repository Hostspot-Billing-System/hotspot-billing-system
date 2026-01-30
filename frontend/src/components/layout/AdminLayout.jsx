import { useMemo } from 'react';
import {
  AppBar,
  Box,
  CssBaseline,
  Toolbar,
  Typography,
} from '@mui/material';
import AdminSidebar, { ADMIN_SIDEBAR_MENU } from './AdminSidebar';

const drawerWidth = 240;

export const ADMIN_SIDEBAR_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', path: '/' },
  { key: 'upload', label: 'Voucher Upload', path: '/voucher-upload' },
  { key: 'batches', label: 'Batch History', path: '/batch-history' },
  { key: 'vouchers', label: 'Vouchers', path: '/vouchers' },
];

function getActivePath(activePath) {
  if (activePath != null) return String(activePath);
  if (typeof window !== 'undefined' && window.location?.pathname) return window.location.pathname;
  return '';
}

export default function AdminLayout({
  title = 'Hotspot Admin',
  items = ADMIN_SIDEBAR_ITEMS,
  activeKey,
  activePath,
  onNavigate,
  children,
}) {
  const resolvedActivePath = getActivePath(activePath);

  const resolvedTitle = useMemo(() => {
    if (activeKey) {
      const match = ADMIN_SIDEBAR_MENU.find((i) => i.key === activeKey) || items.find((i) => i.key === activeKey);
      if (match?.label) return match.label;
    }

    const matchByPath =
      ADMIN_SIDEBAR_MENU.find((i) => i.path && i.path === resolvedActivePath) ||
      items.find((i) => i.path && i.path === resolvedActivePath);
    if (matchByPath?.label) return matchByPath.label;

    return title;
  }, [activeKey, items, resolvedActivePath, title]);

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <CssBaseline />

      <AdminSidebar
        title="Hotspot System"
        width={drawerWidth}
        activeKey={activeKey}
        activePath={resolvedActivePath}
        onNavigate={(item) => {
          if (typeof onNavigate === 'function') onNavigate(item);
        }}
      />

      <AppBar
        position="fixed"
        color="default"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          ml: `${drawerWidth}px`,
          width: `calc(100% - ${drawerWidth}px)`,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Toolbar>
          <Typography variant="h6" fontWeight={800}>
            {resolvedTitle}
          </Typography>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          ml: `${drawerWidth}px`,
          bgcolor: (theme) => theme.palette.grey[50],
          minHeight: '100vh',
        }}
      >
        <Toolbar />
        <Box sx={{ p: 3 }}>{children}</Box>
      </Box>
    </Box>
  );
}
