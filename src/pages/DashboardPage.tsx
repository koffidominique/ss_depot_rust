import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  TrendingUp,
  Wallet,
  ShoppingBag,
  Users,
  Truck,
  Receipt,
  Landmark,
  AlertTriangle,
  Plus,
  PackagePlus,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { apiClient } from '../services/api/createApiClient.ts';
import { MetricCard } from '../components/common/MetricCard.tsx';
import { FormTipsButton } from '../components/common/FormTipsButton.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States.tsx';
import { formatDateTime, formatFcfa, formatNumber, formatQty } from '../utils/format.ts';

interface MonthlyDayRow {
  day: string;
  dayNum: string;
  fullDateLabel: string;
  revenue: number;
  collected: number;
  count: number;
}

function formatCompactFcfa(value: number): string {
  if (value === 0) return '0';
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace('.0', '')}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return String(value);
}

export function DashboardPage() {
  const [chartMode, setChartMode] = useState<'revenue' | 'comparison'>('revenue');

  const { monthFrom, monthTo, monthLabel, daysInMonth, yearMonth } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const ym = `${year}-${String(month + 1).padStart(2, '0')}`;
    const rawLabel = format(now, 'MMMM yyyy', { locale: fr });
    return {
      yearMonth: ym,
      monthFrom: `${ym}-01`,
      monthTo: `${ym}-${String(lastDay).padStart(2, '0')}`,
      monthLabel: rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1),
      daysInMonth: lastDay,
    };
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiClient.getDashboard(),
  });

  const {
    data: monthlyReport,
    isLoading: reportLoading,
    error: reportError,
    refetch: refetchReport,
  } = useQuery({
    queryKey: ['reports', 'current-month', monthFrom, monthTo],
    queryFn: () => apiClient.getReports(monthFrom, monthTo),
  });

  const monthlyDailyRows = useMemo<MonthlyDayRow[]>(() => {
    const byDay = new Map<string, { revenue: number; collected: number; count: number }>();
    for (const pt of monthlyReport?.dailySales ?? []) {
      byDay.set(pt.day, {
        revenue: Number(pt.revenue || 0),
        collected: Number(pt.collected || 0),
        count: Number(pt.count || 0),
      });
    }
    const rows: MonthlyDayRow[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = String(d).padStart(2, '0');
      const isoDay = `${yearMonth}-${dd}`;
      const match = byDay.get(isoDay);
      const parsedDate = new Date(`${isoDay}T12:00:00`);
      rows.push({
        day: isoDay,
        dayNum: dd,
        fullDateLabel: format(parsedDate, 'dd MMM yyyy', { locale: fr }),
        revenue: match?.revenue ?? 0,
        collected: match?.collected ?? 0,
        count: match?.count ?? 0,
      });
    }
    return rows;
  }, [monthlyReport, daysInMonth, yearMonth]);

  if (isLoading) return <LoadingState rows={6} />;
  if (error || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Erreur de chargement du tableau de bord.'}
        onRetry={() => refetch()}
      />
    );
  }

  const { kpis, lowStockProducts, topProducts, recentAudit } = data;
  const overdueReceivablesCount = kpis.overdueReceivablesCount ?? 0;
  const overdueReceivablesTotal = kpis.overdueReceivablesTotal ?? 0;
  const overdueSupplierDebtsCount = kpis.overdueSupplierDebtsCount ?? 0;
  const overdueSupplierDebtsTotal = kpis.overdueSupplierDebtsTotal ?? 0;
  const hasOverdueAlerts = overdueReceivablesCount > 0 || overdueSupplierDebtsCount > 0;
  const activeDaysCount = (monthlyReport?.dailySales ?? []).filter((d) => d.count > 0).length;
  const monthlyRevenue = monthlyReport?.commercial?.merchandise_revenue ?? 0;
  const monthlyCollected = monthlyReport?.commercial?.paid_amount ?? 0;
  const monthlySalesCount = monthlyReport?.commercial?.count ?? 0;
  const avgPerActiveDay = activeDaysCount > 0 ? Math.round(monthlyRevenue / activeDaysCount) : 0;

  return (
    <div className="space-y-6">
      {/* Actions rapides */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#182230] dark:text-slate-100">
            Situation commerciale et financière
          </h2>
          <p className="text-xs text-[#667085] dark:text-slate-400">
            Indicateurs calculés en temps réel depuis les écritures validées en FCFA.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FormTipsButton topicId="dashboard" label="Comprendre les KPI" />
          <Link
            to="/purchases"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-4 py-2 text-xs font-semibold text-[#182230] dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <PackagePlus className="h-4 w-4 text-[#2563EB]" />
            Nouvel approvisionnement
          </Link>
          <Link
            to="/sales/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nouvelle vente
          </Link>
        </div>
      </div>

      {/* Alertes proactives d'échéances dépassées */}
      {hasOverdueAlerts && (
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
      )}

      {/* KPIs principaux — séparation stricte CA / Encaissements / Caisse / Créances / Dettes */}
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

      {/* Graphique journalier du mois en cours (/api/reports) & Top produits */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
                Ventes journalières · {monthLabel}
              </h3>
              <p className="mt-0.5 text-xs text-[#667085] dark:text-slate-400 font-mono-num">
                CA mois : <span className="font-semibold text-[#182230] dark:text-slate-100">{formatFcfa(monthlyRevenue)}</span>
                {' · '}Encaissé : <span className="font-semibold text-[#16A36A] dark:text-emerald-400">{formatFcfa(monthlyCollected)}</span>
                {' · '}{formatNumber(monthlySalesCount)} vente(s)
                {activeDaysCount > 0 ? ` · Moy./jour actif : ${formatFcfa(avgPerActiveDay)}` : ''}
              </p>
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setChartMode('revenue')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  chartMode === 'revenue'
                    ? 'bg-[#2563EB] text-white'
                    : 'text-[#667085] dark:text-slate-300 hover:text-[#182230] dark:hover:text-white'
                }`}
              >
                CA journalier
              </button>
              <button
                type="button"
                onClick={() => setChartMode('comparison')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  chartMode === 'comparison'
                    ? 'bg-[#2563EB] text-white'
                    : 'text-[#667085] dark:text-slate-300 hover:text-[#182230] dark:hover:text-white'
                }`}
              >
                CA & Encaissé
              </button>
            </div>
          </div>

          <div className="mt-4 h-72 w-full">
            {reportLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-56 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
              </div>
            ) : reportError ? (
              <ErrorState
                message={
                  reportError instanceof Error
                    ? reportError.message
                    : 'Impossible de charger les ventes mensuelles.'
                }
                onRetry={() => refetchReport()}
              />
            ) : monthlySalesCount === 0 ? (
              <EmptyState
                title={`Aucune vente validée en ${monthLabel}`}
                description="Le graphique journalier s'affichera automatiquement dès la validation d'une première vente ce mois-ci."
                action={
                  <Link
                    to="/sales/new"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nouvelle vente
                  </Link>
                }
                className="h-full border-none bg-transparent py-6"
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyDailyRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" opacity={0.35} vertical={false} />
                  <XAxis
                    dataKey="dayNum"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    interval={daysInMonth > 20 ? 1 : 0}
                  />
                  <YAxis
                    tickFormatter={formatCompactFcfa}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(37, 99, 235, 0.08)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const row = payload[0].payload as MonthlyDayRow;
                      return (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] px-3 py-2 text-xs shadow-md">
                          <div className="font-semibold text-[#182230] dark:text-slate-100">
                            {row.fullDateLabel}
                          </div>
                          <div className="mt-1 space-y-0.5 font-mono-num">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[#667085] dark:text-slate-400">CA marchandises</span>
                              <span className="font-semibold text-[#2563EB] dark:text-[#60A5FA]">
                                {formatFcfa(row.revenue)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-[#667085] dark:text-slate-400">Encaissé</span>
                              <span className="font-semibold text-[#16A36A] dark:text-emerald-400">
                                {formatFcfa(row.collected)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4 text-[11px] text-[#667085] dark:text-slate-400 pt-0.5">
                              <span>Ventes validées</span>
                              <span>{row.count}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="revenue"
                    name="CA marchandises"
                    fill="#2563EB"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                  />
                  {chartMode === 'comparison' && (
                    <Bar
                      dataKey="collected"
                      name="Encaissé"
                      fill="#16A36A"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={26}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] p-5">
          <h3 className="font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
            Top produits vendus
          </h3>
          <p className="text-xs text-[#667085] dark:text-slate-400">
            Classement par chiffre d'affaires généré
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
      </div>

      {/* Alertes stock & journal d'audit récent */}
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
                Tous les produits actifs sont au-dessus de leur seuil d'alerte.
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
            Journal d'audit récent
          </h3>
          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {recentAudit.length === 0 ? (
              <p className="py-6 text-center text-xs text-[#667085] dark:text-slate-400">
                Aucune écriture d'audit enregistrée.
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
    </div>
  );
}
