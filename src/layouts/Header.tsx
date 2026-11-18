import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lock, Moon, Sun, Landmark, Settings, HelpCircle, Search, AlertTriangle, Menu } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { useUiStore } from '../stores/uiStore.ts';
import { resolveTopicIdFromPath } from '../data/businessTips.ts';
import { GlobalSearchModal } from '../components/common/GlobalSearchModal.tsx';
import { formatFcfa } from '../utils/format.ts';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Tableau de bord',
  '/sales/new': 'Nouvelle vente (Point de vente)',
  '/sales': 'Historique des ventes',
  '/clients': 'Clients & Politiques de crédit',
  '/debts': 'Créances clients',
  '/products': 'Catalogue produits & conditionnements',
  '/stock': 'Stocks & Mouvements',
  '/inventories': 'Inventaires physiques',
  '/consignments': 'Consignations & Emballages vides',
  '/suppliers': 'Fournisseurs',
  '/purchases': 'Approvisionnements & Réceptions',
  '/cash': 'Session de caisse',
  '/expenses': 'Dépenses',
  '/reports': 'Rapports & Indicateurs financiers',
  '/settings': 'Paramètres généraux',
  '/backups': 'Sauvegardes & Restauration',
};

export function Header({ onOpenMobileMenu }: { onOpenMobileMenu?: () => void } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const token = useUiStore((s) => s.token);
  const currentUser = useUiStore((s) => s.currentUser);
  const setCurrentUser = useUiStore((s) => s.setCurrentUser);
  const setToken = useUiStore((s) => s.setToken);
  const openTips = useUiStore((s) => s.openTips);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!token || currentUser || typeof apiClient.getMe !== 'function') return;
    let cancelled = false;
    apiClient
      .getMe()
      .then((res) => {
        if (!cancelled && res?.user) setCurrentUser(res.user);
      })
      .catch(() => {
        // ignore in mock environments or unauthorized checks handled elsewhere
      });
    return () => {
      cancelled = true;
    };
  }, [token, currentUser, setCurrentUser]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const title = PAGE_TITLES[location.pathname] ?? 'DEPOTPRO ERP';
  const topicId = resolveTopicIdFromPath(location.pathname);

  const { data: cash } = useQuery({
    queryKey: ['cash'],
    queryFn: () => apiClient.getCashStatus(),
    refetchInterval: 30000,
  });

  const { data: dash } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () =>
      typeof apiClient.getDashboard === 'function'
        ? apiClient.getDashboard().catch(() => null)
        : Promise.resolve(null),
    refetchInterval: 60000,
  });

  const overdueReceivables = dash?.kpis?.overdueReceivablesCount ?? 0;
  const overdueSuppliers = dash?.kpis?.overdueSupplierDebtsCount ?? 0;
  const totalOverdue = overdueReceivables + overdueSuppliers;

  const handleLock = async () => {
    try {
      await apiClient.lock();
    } catch {
      setToken(null);
    }
    navigate('/login');
  };

  return (
    <header className="no-print flex h-16 items-center justify-between gap-2 sm:gap-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] px-3 sm:px-6 shrink-0">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Ouvrir le menu de navigation"
            className="md:hidden rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="hidden sm:flex items-center gap-2 text-xs text-[#667085] dark:text-slate-400">
            <span>DEPOTPRO</span>
            <span aria-hidden="true">/</span>
            <span className="truncate">{title}</span>
          </div>
          <h1 className="font-display text-sm sm:text-base font-semibold text-[#182230] dark:text-slate-100 truncate">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {totalOverdue > 0 && (
          <Link
            to={overdueReceivables > 0 ? '/debts' : '/suppliers'}
            aria-label="Voir les échéances dépassées"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-2 xl:px-2.5 py-1.5 text-xs font-semibold text-[#DC4545] dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors whitespace-nowrap shrink-0"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:inline font-mono-num">{totalOverdue} échéance(s)</span>
          </Link>
        )}

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Ouvrir la recherche globale"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 xl:px-3 py-1.5 text-xs text-[#667085] dark:text-slate-300 hover:border-[#2563EB] hover:text-[#182230] dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden 2xl:inline">Rechercher...</span>
          <kbd className="hidden xl:inline-block rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 font-mono-num text-[10px]">
            Ctrl+K
          </kbd>
        </button>

        <Link
          to="/cash"
          aria-label="Statut de la caisse"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 xl:px-3 py-1.5 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Landmark
            className={`h-3.5 w-3.5 ${
              cash?.activeSession ? 'text-[#16A36A]' : 'text-[#D9901A]'
            }`}
          />
          {cash?.activeSession ? (
            <span className="hidden xl:inline font-mono-num">
              Caisse ouverte · {formatFcfa(cash.summary?.theoreticalCash ?? cash.activeSession.opening_cash)}
            </span>
          ) : (
            <span className="hidden xl:inline">Caisse fermée</span>
          )}
        </Link>

        <button
          type="button"
          onClick={() => openTips(topicId)}
          aria-label="Conseils et règles métier"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 xl:px-3 py-1.5 text-xs font-medium text-[#182230] dark:text-slate-200 hover:border-[#2563EB] hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors whitespace-nowrap shrink-0"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Conseils</span>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? 'Activer le thème sombre' : 'Activer le thème clair'}
          className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>

        <Link
          to="/settings"
          aria-label="Paramètres"
          className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <Settings className="h-4 w-4" />
        </Link>

        {currentUser && (
          <div
            title={`Connecté en tant que ${currentUser.displayName} (${currentUser.roleLabel})`}
            className="hidden 2xl:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-[#182230] dark:text-slate-200 whitespace-nowrap shrink-0"
          >
            <span className="truncate max-w-[120px]">{currentUser.displayName}</span>
            <span className="rounded bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-[#2563EB] dark:text-[#60A5FA]">
              {currentUser.roleLabel}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={handleLock}
          aria-label="Verrouiller"
          className="inline-flex items-center gap-2 rounded-lg bg-[#101B33] dark:bg-[#2563EB] px-2.5 lg:px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
        >
          <Lock className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Verrouiller</span>
        </button>
      </div>
      <GlobalSearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
