import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Download,
  HelpCircle,
  Landmark,
  Lock,
  Moon,
  Power,
  Search,
  Settings,
  Sun,
  WifiOff,
} from 'lucide-react';
import {
  DP_BUTTON_HOVER,
  DP_BUTTON_TAP,
  DP_SPRING_SNAPPY,
} from '../components/motion/MotionPrimitives.tsx';
import type { CashStatus, SessionUser } from '../types/erp.ts';
import { formatFcfa } from '../utils/format.ts';

/* ============================================================================
 * Barre d'actions de l'en-tête (PWA, alertes, caisse, aide, thème, session)
 * ============================================================================ */

interface HeaderActionsProps {
  isOnline: boolean;
  canInstall: boolean;
  onPromptInstall: () => void;
  totalOverdue: number;
  overdueReceivables: number;
  onOpenSearch: () => void;
  cash: CashStatus | undefined;
  onOpenTips: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  currentUser: SessionUser | null;
  onLock: () => void;
  onShutdown: () => void;
  isShuttingDown: boolean;
}

export function HeaderActions({
  isOnline,
  canInstall,
  onPromptInstall,
  totalOverdue,
  overdueReceivables,
  onOpenSearch,
  cash,
  onOpenTips,
  theme,
  onToggleTheme,
  currentUser,
  onLock,
  onShutdown,
  isShuttingDown,
}: HeaderActionsProps) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
      {/* Statut réseau & installation PWA */}
      {!isOnline && (
        <span
          title="Mode hors-ligne actif"
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-2 py-1.5 text-xs font-medium text-[#D9901A] whitespace-nowrap shrink-0"
        >
          <WifiOff className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Hors-ligne</span>
        </span>
      )}

      {canInstall && (
        <motion.button
          type="button"
          whileHover={DP_BUTTON_HOVER}
          whileTap={DP_BUTTON_TAP}
          transition={DP_SPRING_SNAPPY}
          onClick={onPromptInstall}
          aria-label="Installer l'application PWA"
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1.5 text-xs font-semibold text-[#2563EB] dark:text-[#60A5FA] hover:shadow-sm transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Installer l&apos;app</span>
        </motion.button>
      )}

      {/* Alerte échéances dépassées */}
      {totalOverdue > 0 && (
        <Link
          to={overdueReceivables > 0 ? '/debts' : '/suppliers'}
          aria-label="Voir les échéances dépassées"
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-2 xl:px-2.5 py-1.5 text-xs font-semibold text-[#DC4545] dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 hover:scale-[1.02] transition-all whitespace-nowrap shrink-0 shadow-xs"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden lg:inline font-mono-num">{totalOverdue} échéance(s)</span>
        </Link>
      )}

      {/* Recherche globale (Ctrl+K) */}
      <motion.button
        type="button"
        whileHover={DP_BUTTON_HOVER}
        whileTap={DP_BUTTON_TAP}
        transition={DP_SPRING_SNAPPY}
        onClick={onOpenSearch}
        aria-label="Ouvrir la recherche globale"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 xl:px-3 py-1.5 text-xs text-[#667085] dark:text-slate-300 hover:border-[#2563EB]/60 hover:text-[#182230] dark:hover:text-white hover:shadow-sm transition-colors whitespace-nowrap shrink-0"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden 2xl:inline">Rechercher...</span>
        <kbd className="hidden xl:inline-block rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 font-mono-num text-[10px]">
          Ctrl+K
        </kbd>
      </motion.button>

      {/* Statut caisse */}
      <Link
        to="/cash"
        aria-label="Statut de la caisse"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 xl:px-3 py-1.5 text-xs font-medium text-[#182230] dark:text-slate-200 hover:border-[#2563EB]/40 hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-[1.02] hover:shadow-sm transition-all whitespace-nowrap shrink-0"
      >
        <Landmark
          className={`h-3.5 w-3.5 ${cash?.activeSession ? 'text-[#16A36A]' : 'text-[#D9901A]'}`}
        />
        {cash?.activeSession ? (
          <span className="hidden xl:inline font-mono-num">
            Caisse ouverte · {formatFcfa(cash.summary?.theoreticalCash ?? cash.activeSession.opening_cash)}
          </span>
        ) : (
          <span className="hidden xl:inline">Caisse fermée</span>
        )}
      </Link>

      {/* Conseils métier, Thème & Paramètres */}
      <motion.button
        type="button"
        whileHover={DP_BUTTON_HOVER}
        whileTap={DP_BUTTON_TAP}
        transition={DP_SPRING_SNAPPY}
        onClick={onOpenTips}
        aria-label="Conseils et règles métier"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 xl:px-3 py-1.5 text-xs font-medium text-[#182230] dark:text-slate-200 hover:border-[#2563EB]/60 hover:text-[#2563EB] dark:hover:text-[#60A5FA] hover:shadow-sm transition-colors whitespace-nowrap shrink-0"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span className="hidden xl:inline">Conseils</span>
      </motion.button>

      <motion.button
        type="button"
        whileHover={DP_BUTTON_HOVER}
        whileTap={DP_BUTTON_TAP}
        transition={DP_SPRING_SNAPPY}
        onClick={onToggleTheme}
        aria-label={theme === 'light' ? 'Activer le thème sombre' : 'Activer le thème clair'}
        className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300 hover:border-[#2563EB]/50 hover:bg-slate-100 dark:hover:bg-slate-800 hover:shadow-sm transition-colors shrink-0"
      >
        {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </motion.button>

      <Link
        to="/settings"
        aria-label="Paramètres"
        className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300 hover:border-[#2563EB]/50 hover:bg-slate-100 dark:hover:bg-slate-800 hover:scale-[1.04] hover:shadow-sm transition-all shrink-0"
      >
        <Settings className="h-4 w-4" />
      </Link>

      {/* Utilisateur connecté, Verrouillage & Arrêt */}
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

      <motion.button
        type="button"
        whileHover={DP_BUTTON_HOVER}
        whileTap={DP_BUTTON_TAP}
        transition={DP_SPRING_SNAPPY}
        onClick={onLock}
        aria-label="Verrouiller"
        className="inline-flex items-center gap-2 rounded-lg bg-[#101B33] dark:bg-[#2563EB] dp-btn-elevated px-2.5 lg:px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0"
      >
        <Lock className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Verrouiller</span>
      </motion.button>

      <motion.button
        type="button"
        whileHover={isShuttingDown ? undefined : DP_BUTTON_HOVER}
        whileTap={isShuttingDown ? undefined : DP_BUTTON_TAP}
        transition={DP_SPRING_SNAPPY}
        onClick={onShutdown}
        disabled={isShuttingDown}
        aria-label="Éteindre l'application"
        className={`inline-flex items-center gap-2 rounded-lg bg-[#DC4545] shadow-sm hover:shadow-md px-2.5 lg:px-3.5 py-2 text-xs font-semibold text-white transition-all whitespace-nowrap shrink-0 ${isShuttingDown ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <Power className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">{isShuttingDown ? 'Fermeture...' : 'Éteindre'}</span>
      </motion.button>
    </div>
  );
}
