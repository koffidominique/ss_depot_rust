import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { DP_EASE } from '../../../components/motion/MotionPrimitives.tsx';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState, ErrorState } from '../../../components/common/States.tsx';
import { formatFcfa, formatNumber } from '../../../utils/format.ts';
import type { MonthlyDayRow } from '../hooks/useDashboardData.ts';

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

export function MonthlySalesChart({
  monthLabel,
  daysInMonth,
  monthlyDailyRows,
  monthlyRevenue,
  monthlyCollected,
  monthlySalesCount,
  activeDaysCount,
  avgPerActiveDay,
  isLoading,
  error,
  onRetry,
}: {
  monthLabel: string;
  daysInMonth: number;
  monthlyDailyRows: MonthlyDayRow[];
  monthlyRevenue: number;
  monthlyCollected: number;
  monthlySalesCount: number;
  activeDaysCount: number;
  avgPerActiveDay: number;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const [chartMode, setChartMode] = useState<'revenue' | 'comparison'>('revenue');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: DP_EASE }}
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface-interactive p-5 lg:col-span-2"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
            Ventes journalières · {monthLabel}
          </h3>
          <p className="mt-0.5 text-xs text-[#667085] dark:text-slate-400 font-mono-num">
            CA mois :{' '}
            <span className="font-semibold text-[#182230] dark:text-slate-100">
              {formatFcfa(monthlyRevenue)}
            </span>
            {' · '}Encaissé :{' '}
            <span className="font-semibold text-[#16A36A] dark:text-emerald-400">
              {formatFcfa(monthlyCollected)}
            </span>
            {' · '}
            {formatNumber(monthlySalesCount)} vente(s)
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
            CA &amp; Encaissé
          </button>
        </div>
      </div>

      <div className="mt-4 h-72 w-full">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-56 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/60" />
          </div>
        ) : error ? (
          <ErrorState
            message={
              error instanceof Error
                ? error.message
                : 'Impossible de charger les ventes mensuelles.'
            }
            onRetry={onRetry}
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
    </motion.div>
  );
}
