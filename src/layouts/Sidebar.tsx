import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  LayoutDashboard,
  ShoppingCart,
  ReceiptText,
  FileText,
  Users,
  WalletCards,
  Package,
  Boxes,
  ClipboardCheck,
  Repeat,
  Truck,
  PackagePlus,
  Landmark,
  Receipt,
  BarChart3,
  Settings,
  DatabaseBackup,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { Logo } from '../components/common/Logo.tsx';
import { DP_EASE, DP_SPRING } from '../components/motion/MotionPrimitives.tsx';
import { useUiStore } from '../stores/uiStore.ts';
import { cn } from '../utils/format.ts';

interface NavGroup {
  label: string;
  items: Array<{ to: string; label: string; icon: typeof LayoutDashboard }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Pilotage',
    items: [{ to: '/', label: 'Tableau de bord', icon: LayoutDashboard }],
  },
  {
    label: 'Commerce & Ventes',
    items: [
      { to: '/sales/new', label: 'Nouvelle vente', icon: ShoppingCart },
      { to: '/orders', label: 'Commandes mixtes', icon: ClipboardCheck },
      { to: '/sales', label: 'Historique ventes', icon: ReceiptText },
      { to: '/commercial-documents', label: 'Reçus & Bons de commandes', icon: FileText },
      { to: '/clients', label: 'Clients', icon: Users },
      { to: '/debts', label: 'Créances', icon: WalletCards },
    ],
  },
  {
    label: 'Stocks & Retour emballages',
    items: [
      { to: '/products', label: 'Produits', icon: Package },
      { to: '/stock', label: 'Stocks', icon: Boxes },
      { to: '/inventories', label: 'Inventaires', icon: ClipboardCheck },
      { to: '/consignments', label: 'Retour emballages', icon: Repeat },
    ],
  },
  {
    label: 'Approvisionnements',
    items: [
      { to: '/suppliers', label: 'Fournisseurs', icon: Truck },
      { to: '/purchases', label: 'Approvisionnements', icon: PackagePlus },
    ],
  },
  {
    label: 'Trésorerie & Gestion',
    items: [
      { to: '/cash', label: 'Caisse', icon: Landmark },
      { to: '/expenses', label: 'Dépenses', icon: Receipt },
      { to: '/reports', label: 'Rapports', icon: BarChart3 },
    ],
  },
  {
    label: 'Système',
    items: [
      { to: '/settings', label: 'Paramètres', icon: Settings },
      { to: '/backups', label: 'Sauvegardes', icon: DatabaseBackup },
    ],
  },
];

export function Sidebar({
  mobileOpen = false,
  onCloseMobile,
  logoPath,
  companyName,
}: {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  logoPath?: string | null;
  companyName?: string;
}) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const navContent = (isDrawer: boolean) => (
    <>
      <div className="flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4">
        <Logo collapsed={!isDrawer && collapsed} src={logoPath} alt={companyName || 'Logo DEPOTPRO'} />
        {isDrawer ? (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Fermer le menu"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Déplier la barre latérale' : 'Réduire la barre latérale'}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5" aria-label="Navigation principale">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {(isDrawer || !collapsed) && (
              <div className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wide text-[#667085] dark:text-slate-500">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/' || item.to === '/sales'}
                    title={!isDrawer && collapsed ? item.label : undefined}
                    onClick={() => {
                      if (isDrawer && onCloseMobile) onCloseMobile();
                    }}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200 whitespace-nowrap group',
                        isActive
                          ? 'text-[#2563EB] dark:text-[#60A5FA]'
                          : 'text-[#182230] dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 hover:translate-x-0.5'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId={isDrawer ? 'sidebar-active-mobile' : 'sidebar-active-desktop'}
                            transition={DP_SPRING}
                            className="absolute inset-0 rounded-lg border border-blue-200/80 dark:border-blue-500/30 bg-[#2563EB]/10 dark:bg-[#2563EB]/20 shadow-[0_2px_10px_-3px_rgba(37,99,235,0.25)]"
                          />
                        )}
                        <Icon
                          className="relative z-10 h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110"
                          aria-hidden="true"
                        />
                        {(isDrawer || !collapsed) && (
                          <span className="relative z-10 truncate">{item.label}</span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <>
      <aside
        className={cn(
          'no-print hidden md:flex h-screen flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface transition-[width] duration-200 shrink-0',
          collapsed ? 'w-[70px]' : 'w-[248px]'
        )}
      >
        {navContent(false)}
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="no-print fixed inset-0 z-50 flex md:hidden">
            <motion.button
              type="button"
              aria-label="Fermer le menu latéral"
              onClick={onCloseMobile}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.24, ease: DP_EASE }}
              className="relative z-10 flex h-screen w-[248px] flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-modal-surface"
            >
              {navContent(true)}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
