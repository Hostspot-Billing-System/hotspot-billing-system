import { useEffect, useMemo, useState } from 'react';
import AdminLayout from './components/layout/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
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
import MyProfile from './pages/MyProfile.jsx';
import { getSession } from './services/auth.service.js';
import FullPageLoader from './components/FullPageLoader.jsx';

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
  const [auth, setAuth] = useState({ checked: false, isAuthenticated: false });
  const [overlayLoading, setOverlayLoading] = useState(false);

  useEffect(() => {
    function onPop() {
      setPath(getPath());
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const isPortal = path === '/portal' || path?.startsWith('/portal/');
    if (isPortal) return;

    const isPublicAuth = path === '/admin/login' || path === '/forgot-password' || path === '/reset-password';

    async function checkSession() {
      try {
        const res = await getSession();
        if (cancelled) return;
        const isAuthenticated = Boolean(res?.isAuthenticated);
        setAuth({ checked: true, isAuthenticated });

        if (isAuthenticated && path === '/admin/login') {
          navigateTo('/admin/dashboard');
          return;
        }

        if (!isAuthenticated && !isPublicAuth) {
          navigateTo('/admin/login');
        }
      } catch {
        if (cancelled) return;
        setAuth({ checked: true, isAuthenticated: false });
        if (!isPublicAuth) navigateTo('/admin/login');
      }
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [path]);

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

    if (path === '/admin/login') return <AdminLogin />;
    if (path === '/forgot-password') return <ForgotPassword />;
    if (path === '/reset-password') return <ResetPassword />;

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
    if (path === '/admin/my-profile') return <MyProfile />;

    // Default to admin dashboard for unknown paths
    if (path?.startsWith('/admin')) return <AdminDashboard />;

    // Keep current behavior if someone visits '/' directly
    return <AdminVoucherUpload />;
  }, [path]);

  // Render portal without admin chrome.
  if (path === '/portal' || path?.startsWith('/portal/')) {
    return content;
  }

  // While logging out (or any global transition), show loader on its own page.
  if (overlayLoading) {
    return <FullPageLoader />;
  }

  // While checking session, avoid flashing admin chrome.
  if (!auth.checked) {
    return null;
  }

  // If not authenticated, show login without admin chrome.
  if (!auth.isAuthenticated) {
    if (path === '/forgot-password') return <ForgotPassword />;
    if (path === '/reset-password') return <ResetPassword />;
    return <AdminLogin />;
  }

  // If authenticated but on login path, App effect will redirect.
  if (path === '/admin/login') {
    return <AdminLogin />;
  }

  return (
    <>
      <AdminLayout
        items={sidebarItems}
        activePath={path}
        onNavigate={async (item) => {
          if (item?.key === 'logout') {
            setOverlayLoading(true);

            try {
              await api.post('/api/auth/logout');
            } catch {
              // Even if the request fails, force local logout UX.
            }

            setAuth({ checked: true, isAuthenticated: false });
            navigateTo('/admin/login');

            // Let the route update paint before hiding.
            requestAnimationFrame(() => setOverlayLoading(false));
            return;
          }

          if (item?.path) navigateTo(item.path);
        }}
      >
        {content}
      </AdminLayout>
    </>
  );
}