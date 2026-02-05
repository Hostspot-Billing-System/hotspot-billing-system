import { useMemo, useState } from 'react';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  Toolbar,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import AdminSidebar from './AdminSidebar';
import { ADMIN_SIDEBAR_MENU } from './adminSidebarMenu';

const drawerWidth = 240;

function MenuIconSvg(props) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      sx={{ width: 22, height: 22, display: 'block' }}
      {...props}
    >
      <path
        fill="currentColor"
        d="M3 6h18v2H3V6Zm0 5h18v2H3v-2Zm0 5h18v2H3v-2Z"
      />
    </Box>
  );
}

const ADMIN_SIDEBAR_ITEMS = [
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
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

      {/* Desktop: fixed sidebar. Tablet/Mobile: drawer (collapsible). */}
      {isDesktop ? (
        <AdminSidebar
          title="Hotspot System"
          width={drawerWidth}
          activeKey={activeKey}
          activePath={resolvedActivePath}
          onNavigate={(item) => {
            if (typeof onNavigate === 'function') onNavigate(item);
          }}
        />
      ) : (
        <Drawer
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          variant="temporary"
          sx={{
            zIndex: (theme) => theme.zIndex.modal + 1,
          }}
          ModalProps={{ keepMounted: true }}
          PaperProps={{
            sx: {
              width: { xs: '86vw', sm: 320, md: 360 },
              maxWidth: '100%',
              height: '100dvh',
              maxHeight: '100dvh',
              top: 0,
              borderRadius: 0,
              borderRight: '1px solid rgba(255,255,255,0.08)',
            },
          }}
        >
          <AdminSidebar
            variant="drawer"
            title="Hotspot System"
            activeKey={activeKey}
            activePath={resolvedActivePath}
            showClose
            onClose={() => setSidebarOpen(false)}
            onNavigate={(item) => {
              setSidebarOpen(false);
              if (typeof onNavigate === 'function') onNavigate(item);
            }}
          />
        </Drawer>
      )}

      <AppBar
        position="fixed"
        color="default"
        elevation={0}
        sx={{
          zIndex: (theme) => (isDesktop ? theme.zIndex.drawer + 1 : theme.zIndex.appBar),
          ml: { xs: 0, lg: `${drawerWidth}px` },
          width: { xs: '100%', lg: `calc(100% - ${drawerWidth}px)` },
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Toolbar sx={{ gap: 1 }}>
          {!isDesktop ? (
            <IconButton
              aria-label="Open menu"
              onClick={() => setSidebarOpen(true)}
              edge="start"
              sx={{ mr: 0.5 }}
            >
              <MenuIconSvg />
            </IconButton>
          ) : null}

          <Typography
            variant="h6"
            fontWeight={800}
            sx={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {resolvedTitle}
          </Typography>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          ml: { xs: 0, lg: `${drawerWidth}px` },
          bgcolor: (theme) => theme.palette.grey[50],
          minHeight: '100vh',
          minWidth: 0,
        }}
      >
        <Toolbar />
        <Box sx={{ p: { xs: 2, sm: 2.5, md: 3 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
