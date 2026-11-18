import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  ReceiptText,
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
      { to: '/sales', label: 'Historique ventes', icon: ReceiptText },
      { to: '/clients', label: 'Clients', icon: Users },
      { to: '/debts', label: 'Créances', icon: WalletCards },
    ],
  },
  {
    label: 'Stocks & Consignes',
    items: [
      { to: '/products', label: 'Produits', icon: Package },
      { to: '/stock', label: 'Stocks', icon: Boxes },
      { to: '/inventories', label: 'Inventaires', icon: ClipboardCheck },
      { to: '/consignments', label: 'Consignations', icon: Repeat },
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
}: {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const navContent = (isDrawer: boolean) => (
    <>
      <div className="flex h-16 items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4">
        <Logo collapsed={!isDrawer && collapsed} />
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
                        'flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors whitespace-nowrap',
                        isActive
                          ? 'bg-[#2563EB]/10 text-[#2563EB] dark:bg-[#2563EB]/20 dark:text-[#60A5FA]'
                          : 'text-[#182230] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {(isDrawer || !collapsed) && <span className="truncate">{item.label}</span>}
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
          'no-print hidden md:flex h-screen flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] transition-[width] duration-200 shrink-0',
          collapsed ? 'w-[70px]' : 'w-[248px]'
        )}
      >
        {navContent(false)}
      </aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 flex md:hidden">
          <button
            type="button"
            aria-label="Fermer le menu latéral"
            onClick={onCloseMobile}
            className="fixed inset-0 bg-slate-950/50"
          />
          <aside className="relative z-10 flex h-screen w-[248px] flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] shadow-xl">
            {navContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}
