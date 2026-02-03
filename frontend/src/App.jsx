import { useEffect, useMemo, useState } from 'react';
import AdminLayout from './components/layout/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminBundles from './pages/AdminBundles';
import AdminTransactions from './pages/AdminTransactions';
import AdminWithdraw from './pages/AdminWithdraw';
import AdminVoucherUpload from './pages/AdminVoucherUpload';
import AdminVouchers from './pages/AdminVouchers';
import BatchHistory from './pages/BatchHistory';
import AdminReports from './pages/AdminReports.jsx';
import AdminClients from './pages/AdminClients.jsx';
import MikroTikRouters from './pages/MikroTikRouters.jsx';
import PortalHome from './portal/PortalHome.jsx';

function getPath() {
  if (typeof window === 'undefined') return '/';
  return window.location?.pathname ?? '/';
}

function navigateTo(path) {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function App() {
  const [path, setPath] = useState(getPath());

  useEffect(() => {
    function onPop() {
      setPath(getPath());
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const sidebarItems = useMemo(
    () => [
      { key: 'dashboard', label: 'Dashboard', path: '/admin' },
      { key: 'upload', label: 'Voucher Upload', path: '/admin/voucher-upload' },
      { key: 'batches', label: 'Batch History', path: '/admin/batches' },
      { key: 'vouchers', label: 'Vouchers', path: '/admin/vouchers' },
      { key: 'transactions', label: 'Transactions', path: '/admin/transactions' },
      { key: 'withdraw', label: 'Withdraw', path: '/admin/withdraw' },
    ],
    []
  );

  const content = useMemo(() => {
    // Captive portal UI (public)
    if (path === '/portal' || path?.startsWith('/portal/')) {
      return <PortalHome />;
    }

    // Quick Action aliases (logic-only)
    if (path === '/vouchers') return <AdminVouchers />;
    if (path === '/bundles') return <AdminBundles />;
    if (path === '/transactions') return <AdminTransactions />;
    if (path === '/reports') return <AdminReports />;
    if (path === '/clients') return <AdminClients />;
    if (path === '/mikrotik-routers') return <MikroTikRouters />;

    if (path === '/admin' || path === '/admin/dashboard') return <AdminDashboard />;
    if (path === '/admin/bundles') return <AdminBundles />;
    if (path === '/admin/transactions') return <AdminTransactions />;
    if (path === '/admin/withdraw') return <AdminWithdraw />;
    if (path === '/admin/voucher-upload') return <AdminVoucherUpload />;
    if (path === '/admin/batches') return <BatchHistory />;
    if (path === '/admin/vouchers') return <AdminVouchers />;
    if (path === '/admin/reports') return <AdminReports />;
    if (path === '/admin/clients') return <AdminClients />;
    if (path === '/admin/mikrotik-routers') return <MikroTikRouters />;

    // Default to admin dashboard for unknown paths
    if (path?.startsWith('/admin')) return <AdminDashboard />;

    // Keep current behavior if someone visits '/' directly
    return <AdminVoucherUpload />;
  }, [path]);

  // Render portal without admin chrome.
  if (path === '/portal' || path?.startsWith('/portal/')) {
    return content;
  }

  return (
    <AdminLayout
      items={sidebarItems}
      activePath={path}
      onNavigate={(item) => {
        if (item?.path) navigateTo(item.path);
      }}
    >
      {content}
    </AdminLayout>
  );
}