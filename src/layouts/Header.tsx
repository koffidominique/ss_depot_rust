import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Menu } from 'lucide-react';
import { DP_BUTTON_HOVER, DP_BUTTON_TAP, DP_SPRING_SNAPPY } from '../components/motion/MotionPrimitives.tsx';
import { usePwaInstall } from '../pwa/pwaManager.ts';
import { apiClient } from '../services/api/createApiClient.ts';
import { useUiStore } from '../stores/uiStore.ts';
import { resolveTopicIdFromPath } from '../data/businessTips.ts';
import { GlobalSearchModal } from '../components/common/GlobalSearchModal.tsx';
import { HeaderActions } from './HeaderActions.tsx';

/* ============================================================================
 * En-tête applicatif principal (fil d'Ariane, raccourcis clavier & état global)
 * ============================================================================ */

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
  const { canInstall, isOnline, promptInstall } = usePwaInstall();
  const [searchOpen, setSearchOpen] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);

  /* --- Synchronisation du profil utilisateur courant --- */
  useEffect(() => {
    if (!token || currentUser || typeof apiClient.getMe !== 'function') return;
    let cancelled = false;
    apiClient
      .getMe()
      .then((res) => {
        if (!cancelled && res?.user) setCurrentUser(res.user);
      })
      .catch(() => {
        // Ignoré en environnement mock ; les 401 sont gérés par le client API
      });
    return () => {
      cancelled = true;
    };
  }, [token, currentUser, setCurrentUser]);

  /* --- Raccourci clavier Ctrl+K / Cmd+K pour la recherche globale --- */
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

  const handleShutdown = async () => {
    if (isShuttingDown) return;
    if (!confirm('Voulez-vous vraiment fermer l\'application ? Une sauvegarde automatique sera effectuée avant la fermeture.')) return;

    setIsShuttingDown(true);
    try {
      await apiClient.createBackup();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erreur inconnue';
      if (!confirm(`La sauvegarde automatique a échoué : ${errorMessage}\nVoulez-vous quand même fermer l'application ?`)) {
        setIsShuttingDown(false);
        return;
      }
    }

    try {
      setToken(null);
      await apiClient.shutdownApp();
    } catch (err) {
      console.error('Erreur lors de la fermeture de l\'application:', err);
      setIsShuttingDown(false);
    }
  };

  return (
    <header className="no-print flex h-16 items-center justify-between gap-2 sm:gap-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface px-3 sm:px-6 shrink-0">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {onOpenMobileMenu && (
          <motion.button
            type="button"
            whileHover={DP_BUTTON_HOVER}
            whileTap={DP_BUTTON_TAP}
            transition={DP_SPRING_SNAPPY}
            onClick={onOpenMobileMenu}
            aria-label="Ouvrir le menu de navigation"
            className="md:hidden rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <Menu className="h-4 w-4" />
          </motion.button>
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

      <HeaderActions
        isOnline={isOnline}
        canInstall={canInstall}
        onPromptInstall={() => void promptInstall()}
        totalOverdue={totalOverdue}
        overdueReceivables={overdueReceivables}
        onOpenSearch={() => setSearchOpen(true)}
        cash={cash}
        onOpenTips={() => openTips(topicId)}
        theme={theme}
        onToggleTheme={toggleTheme}
        currentUser={currentUser}
        onLock={handleLock}
        onShutdown={handleShutdown}
        isShuttingDown={isShuttingDown}
      />

      <GlobalSearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
