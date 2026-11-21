import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Landmark,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { MetricCard } from '../../../components/common/MetricCard.tsx';
import {
  DP_EASE,
  MotionStaggerGrid,
} from '../../../components/motion/MotionPrimitives.tsx';
import type { DashboardData } from '../../../types/erp.ts';
import { formatFcfa } from '../../../utils/format.ts';

/* ============================================================================
 * Bandeau d'alertes d'échéances & grille de KPI du tableau de bord
 * ============================================================================ */

export function DashboardOverdueAlerts({ kpis }: { kpis: DashboardData['kpis'] }) {
  const overdueReceivablesCount = kpis.overdueReceivablesCount ?? 0;
  const overdueReceivablesTotal = kpis.overdueReceivablesTotal ?? 0;
  const overdueSupplierDebtsCount = kpis.overdueSupplierDebtsCount ?? 0;
  const overdueSupplierDebtsTotal = kpis.overdueSupplierDebtsTotal ?? 0;

  if (overdueReceivablesCount === 0 && overdueSupplierDebtsCount === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: DP_EASE }}
      role="region"
      aria-label="Alertes d'échéances dépassées"
      className="grid grid-cols-1 gap-3 md:grid-cols-2"
    >
      {overdueReceivablesCount > 0 && (
        <Link
          to="/debts"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 dp-surface-interactive px-4 py-3 text-xs hover:scale-[1.01] hover:bg-amber-100/70 dark:hover:bg-amber-950/50"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-[#D9901A] shrink-0" />
            <div>
              <div className="font-semibold text-[#182230] dark:text-amber-200">
                {overdueReceivablesCount} créance(s) client à échéance dépassée
              </div>
              <div className="text-[#667085] dark:text-amber-300/80 font-mono-num">
                Encours échu : {formatFcfa(overdueReceivablesTotal)}
              </div>
            </div>
          </div>
          <span className="font-semibold text-[#D9901A] dark:text-amber-300 whitespace-nowrap shrink-0">
            Relancer →
          </span>
        </Link>
      )}
      {overdueSupplierDebtsCount > 0 && (
        <Link
          to="/suppliers"
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/30 dp-surface-interactive px-4 py-3 text-xs hover:scale-[1.01] hover:bg-rose-100/70 dark:hover:bg-rose-950/50"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-[#DC4545] shrink-0" />
            <div>
              <div className="font-semibold text-[#182230] dark:text-rose-200">
                {overdueSupplierDebtsCount} dette(s) fournisseur échue(s)
              </div>
              <div className="text-[#667085] dark:text-rose-300/80 font-mono-num">
                Solde à régler : {formatFcfa(overdueSupplierDebtsTotal)}
              </div>
            </div>
          </div>
          <span className="font-semibold text-[#DC4545] dark:text-rose-300 whitespace-nowrap shrink-0">
            Régler →
          </span>
        </Link>
      )}
    </motion.div>
  );
}

export function DashboardKpiGrid({ kpis }: { kpis: DashboardData['kpis'] }) {
  return (
    <MotionStaggerGrid className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Chiffre d'affaires marchandises"
        value={formatFcfa(kpis.revenueMerchandise)}
        subtext={`${kpis.salesCount} vente(s) · Retour emballages : ${formatFcfa(kpis.depositsTotal)}`}
        icon={TrendingUp}
        tone="accent"
      />
      <MetricCard
        label="Encaissements totaux"
        value={formatFcfa(kpis.collectionsTotal)}
        subtext="Tous moyens confondus"
        icon={Wallet}
        tone="success"
      />
      <MetricCard
        label="Espèces théoriques en caisse"
        value={kpis.cashSessionOpen ? formatFcfa(kpis.cashPhysicalTheoretical) : 'Caisse fermée'}
        subtext={
          kpis.cashSessionOpen
            ? `${kpis.cashSessionReference} · Numérique : ${formatFcfa(kpis.digitalSessionTotal)}`
            : 'Ouvrez une session pour encaisser'
        }
        icon={Landmark}
        tone={kpis.cashSessionOpen ? 'default' : 'warning'}
      />
      <MetricCard
        label="Créances clients"
        value={formatFcfa(kpis.receivablesTotal)}
        subtext={`${kpis.receivablesCount} facture(s) en attente`}
        icon={Users}
        tone={kpis.receivablesTotal > 0 ? 'warning' : 'default'}
      />
      <MetricCard
        label="Dettes fournisseurs"
        value={formatFcfa(kpis.supplierDebtsTotal)}
        subtext={`${kpis.supplierDebtsCount} réception(s) à régler`}
        icon={Truck}
        tone={kpis.supplierDebtsTotal > 0 ? 'danger' : 'default'}
      />
      <MetricCard
        label="Dépenses enregistrées"
        value={formatFcfa(kpis.expensesTotal)}
        subtext="Sorties de caisse opérationnelles"
        icon={Receipt}
      />
      <MetricCard
        label="Stock faible"
        value={`${kpis.lowStockCount} produit(s)`}
        subtext="Sous le seuil minimum configuré"
        icon={AlertTriangle}
        tone={kpis.lowStockCount > 0 ? 'warning' : 'success'}
      />
      <MetricCard
        label="Ruptures de stock"
        value={`${kpis.outOfStockCount} produit(s)`}
        subtext="Quantité disponible nulle"
        icon={ShoppingBag}
        tone={kpis.outOfStockCount > 0 ? 'danger' : 'success'}
      />
    </MotionStaggerGrid>
  );
}
