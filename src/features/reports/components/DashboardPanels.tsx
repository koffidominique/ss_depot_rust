import { Link } from 'react-router-dom';
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
import type { DashboardData } from '../../../types/erp.ts';
import { formatDateTime, formatFcfa, formatQty } from '../../../utils/format.ts';

export function DashboardOverdueAlerts({ kpis }: { kpis: DashboardData['kpis'] }) {
  const overdueReceivablesCount = kpis.overdueReceivablesCount ?? 0;
  const overdueReceivablesTotal = kpis.overdueReceivablesTotal ?? 0;
  const overdueSupplierDebtsCount = kpis.overdueSupplierDebtsCount ?? 0;
  const overdueSupplierDebtsTotal = kpis.overdueSupplierDebtsTotal ?? 0;

  if (overdueReceivablesCount === 0 && overdueSupplierDebtsCount === 0) return null;

  return (
    <div
      role="region"
      aria-label="Alertes d'échéances dépassées"
      className="grid grid-cols-1 gap-3 md:grid-cols-2"
    >
      {overdueReceivablesCount > 0 && (
        <Link
          to="/debts"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 text-xs hover:bg-amber-100/70 dark:hover:bg-amber-950/50 transition-colors"
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
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/30 px-4 py-3 text-xs hover:bg-rose-100/70 dark:hover:bg-rose-950/50 transition-colors"
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
    </div>
  );
}

export function DashboardKpiGrid({ kpis }: { kpis: DashboardData['kpis'] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Chiffre d'affaires marchandises"
        value={formatFcfa(kpis.revenueMerchandise)}
        subtext={`${kpis.salesCount} vente(s) · Consignes : ${formatFcfa(kpis.depositsTotal)}`}
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
    </div>
  );
}

export function DashboardTopProductsCard({
  topProducts,
}: {
  topProducts: DashboardData['topProducts'];
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
      <h3 className="font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
        Top produits vendus
      </h3>
      <p className="text-xs text-[#667085] dark:text-slate-400">
        Classement par chiffre d&apos;affaires généré
      </p>
      <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
        {topProducts.length === 0 ? (
          <p className="py-8 text-center text-xs text-[#667085] dark:text-slate-400">
            Aucune ligne de vente pour le moment.
          </p>
        ) : (
          topProducts.map((tp) => (
            <div key={tp.product_id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[#182230] dark:text-slate-200">
                  {tp.product_name}
                </div>
                <div className="text-xs text-[#667085] dark:text-slate-400 tabular-nums">
                  {formatQty(tp.total_base_milli, tp.base_unit)}
                </div>
              </div>
              <div className="font-mono-num text-xs font-semibold text-[#182230] dark:text-slate-100 shrink-0">
                {formatFcfa(tp.total_revenue)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function DashboardBottomPanels({
  lowStockProducts,
  recentAudit,
}: {
  lowStockProducts: DashboardData['lowStockProducts'];
  recentAudit: DashboardData['recentAudit'];
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
            Alertes de stock
          </h3>
          <Link
            to="/stock"
            className="text-xs font-medium text-[#2563EB] dark:text-[#60A5FA] hover:underline"
          >
            Voir tout le stock
          </Link>
        </div>
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {lowStockProducts.length === 0 ? (
            <p className="py-6 text-center text-xs text-[#667085] dark:text-slate-400">
              Tous les produits actifs sont au-dessus de leur seuil d&apos;alerte.
            </p>
          ) : (
            lowStockProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[#182230] dark:text-slate-200">
                    {p.name}
                  </div>
                  <div className="text-xs text-[#667085] dark:text-slate-400">
                    {p.reference} · Seuil : {formatQty(p.min_stock_milli, p.base_unit)}
                  </div>
                </div>
                <span
                  className={`font-mono-num text-xs font-semibold shrink-0 ${
                    p.stock_milli <= 0
                      ? 'text-[#DC4545] dark:text-rose-400'
                      : 'text-[#D9901A] dark:text-amber-400'
                  }`}
                >
                  {formatQty(p.stock_milli, p.base_unit)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
        <h3 className="font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
          Journal d&apos;audit récent
        </h3>
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {recentAudit.length === 0 ? (
            <p className="py-6 text-center text-xs text-[#667085] dark:text-slate-400">
              Aucune écriture d&apos;audit enregistrée.
            </p>
          ) : (
            recentAudit.map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#182230] dark:text-slate-200">
                    {log.action}
                  </div>
                  <div className="truncate text-xs text-[#667085] dark:text-slate-400">
                    {log.details}
                  </div>
                </div>
                <span className="font-mono-num text-[11px] text-[#667085] dark:text-slate-400 shrink-0">
                  {formatDateTime(log.created_at)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
