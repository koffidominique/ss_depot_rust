import { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { motion } from 'motion/react';
import { Sidebar } from './Sidebar.tsx';
import { Header } from './Header.tsx';
import { BusinessTipsModal } from '../components/common/BusinessTipsModal.tsx';
import { useUiStore } from '../stores/uiStore.ts';

export function AppLayout() {
  const token = useUiStore((s) => s.token);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F5F7FB] dark:bg-[#0B1220] text-[#182230] dark:text-slate-100">
      <Sidebar mobileOpen={mobileMenuOpen} onCloseMobile={() => setMobileMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
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
