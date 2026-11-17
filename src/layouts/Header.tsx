import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lock, Moon, Sun, Landmark, Settings, HelpCircle } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { useUiStore } from '../stores/uiStore.ts';
import { resolveTopicIdFromPath } from '../data/businessTips.ts';
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

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const setToken = useUiStore((s) => s.setToken);
  const openTips = useUiStore((s) => s.openTips);

  const title = PAGE_TITLES[location.pathname] ?? 'DEPOTPRO ERP';
  const topicId = resolveTopicIdFromPath(location.pathname);

  const { data: cash } = useQuery({
    queryKey: ['cash'],
    queryFn: () => apiClient.getCashStatus(),
    refetchInterval: 30000,
  });

  const handleLock = async () => {
    try {
      await apiClient.lock();
    } catch {
      setToken(null);
    }
    navigate('/login');
  };

  return (
    <header className="no-print flex h-16 items-center justify-between gap-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] px-6 shrink-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-[#667085] dark:text-slate-400">
          <span>DEPOTPRO</span>
          <span aria-hidden="true">/</span>
          <span className="truncate">{title}</span>
        </div>
        <h1 className="font-display text-base font-semibold text-[#182230] dark:text-slate-100 truncate">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Link
          to="/cash"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <Landmark
            className={`h-3.5 w-3.5 ${
              cash?.activeSession ? 'text-[#16A36A]' : 'text-[#D9901A]'
            }`}
          />
          {cash?.activeSession ? (
            <span className="font-mono-num">
              Caisse ouverte · {formatFcfa(cash.summary?.theoreticalCash ?? cash.activeSession.opening_cash)}
            </span>
          ) : (
            <span>Caisse fermée</span>
          )}
        </Link>

        <button
          type="button"
          onClick={() => openTips(topicId)}
          aria-label="Conseils et règles métier"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-[#182230] dark:text-slate-200 hover:border-[#2563EB] hover:text-[#2563EB] dark:hover:text-[#60A5FA] transition-colors whitespace-nowrap shrink-0"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span>Conseils</span>
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

        <button
          type="button"
          onClick={handleLock}
          className="inline-flex items-center gap-2 rounded-lg bg-[#101B33] dark:bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
        >
          <Lock className="h-3.5 w-3.5" />
          Verrouiller
        </button>
      </div>
    </header>
  );
}
