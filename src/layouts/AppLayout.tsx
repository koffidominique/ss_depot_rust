import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Sidebar } from './Sidebar.tsx';
import { Header } from './Header.tsx';
import { BusinessTipsModal } from '../components/common/BusinessTipsModal.tsx';
import { DP_EASE } from '../components/motion/MotionPrimitives.tsx';
import { useUiStore } from '../stores/uiStore.ts';
import { useSettingsQueries } from '../features/settings/hooks/useSettingsData.ts';

export function AppLayout() {
  const location = useLocation();
  const token = useUiStore((s) => s.token);
  const setToken = useUiStore((s) => s.setToken);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const lastActivityRef = useRef<number>(0);
  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, []);
  const { settingsQuery } = useSettingsQueries();

  const inactivityTimeoutMinutes = settingsQuery.data?.settings.inactivity_timeout_minutes ?? 10;
  const inactivityTimeoutMs = inactivityTimeoutMinutes * 60 * 1000;

  useEffect(() => {
    if (!token) return;

    const updateLastActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener('mousemove', updateLastActivity);
    window.addEventListener('mousedown', updateLastActivity);
    window.addEventListener('keydown', updateLastActivity);
    window.addEventListener('touchstart', updateLastActivity);
    window.addEventListener('scroll', updateLastActivity);

    const checkInactivity = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= inactivityTimeoutMs) {
        setToken(null);
      }
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', updateLastActivity);
      window.removeEventListener('mousedown', updateLastActivity);
      window.removeEventListener('keydown', updateLastActivity);
      window.removeEventListener('touchstart', updateLastActivity);
      window.removeEventListener('scroll', updateLastActivity);
      clearInterval(checkInactivity);
    };
  }, [token, setToken, inactivityTimeoutMs]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F5F7FB] dark:bg-[#0B1220] text-[#182230] dark:text-slate-100">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        logoPath={settingsQuery.data?.settings.logo_path}
        companyName={settingsQuery.data?.settings.company_name}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: DP_EASE }}
            className="mx-auto max-w-[1400px]"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <BusinessTipsModal />
    </div>
  );
}