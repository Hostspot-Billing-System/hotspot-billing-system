import { useMemo } from 'react';
import {
  AppBar,
  Box,
  CssBaseline,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';

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
      const match = items.find((i) => i.key === activeKey);
      if (match?.label) return match.label;
    }

    const matchByPath = items.find((i) => i.path && i.path === resolvedActivePath);
    if (matchByPath?.label) return matchByPath.label;

    return title;
  }, [activeKey, items, resolvedActivePath, title]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <CssBaseline />

      <AppBar
        position="fixed"
        color="default"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
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

      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box',
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          },
        }}
      >
        <Toolbar>
          <Typography variant="subtitle1" fontWeight={800}>
            Hotspot Admin
          </Typography>
        </Toolbar>
        <Divider />
        <List>
          {items.map((item) => {
            const selected =
              (activeKey != null && item.key === activeKey) ||
              (activeKey == null && item.path && item.path === resolvedActivePath);

            return (
              <ListItemButton
                key={item.key}
                selected={selected}
                onClick={() => {
                  if (typeof onNavigate === 'function') onNavigate(item);
                }}
              >
                <ListItemText primary={item.label} />
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
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
