import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  DP_CARD_HOVER,
  DP_EASE,
  DP_SPRING,
} from '../../../components/motion/MotionPrimitives.tsx';
import type { DashboardData } from '../../../types/erp.ts';
import { formatDateTime, formatFcfa, formatQty } from '../../../utils/format.ts';

/* ============================================================================
 * Panneaux d'activité du tableau de bord (Top produits, Alertes stock, Audit)
 * ============================================================================ */

export function DashboardTopProductsCard({
  topProducts,
}: {
  topProducts: DashboardData['topProducts'];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={DP_CARD_HOVER}
      transition={{ ...DP_SPRING, opacity: { duration: 0.24, ease: DP_EASE } }}
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface-interactive p-5"
    >
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
            <div
              key={tp.product_id}
              className="flex items-center justify-between gap-3 py-2.5 px-1.5 -mx-1.5 rounded-lg hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
            >
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
    </motion.div>
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
      {/* Alertes de stock */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={DP_CARD_HOVER}
        transition={{ ...DP_SPRING, opacity: { duration: 0.26, ease: DP_EASE } }}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface-interactive p-5"
      >
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
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 py-2.5 px-1.5 -mx-1.5 rounded-lg hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
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
      </motion.div>

      {/* Journal d'audit récent */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={DP_CARD_HOVER}
        transition={{ ...DP_SPRING, opacity: { duration: 0.28, ease: DP_EASE } }}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface-interactive p-5"
      >
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
              <div
                key={log.id}
                className="flex items-start justify-between gap-3 py-2.5 px-1.5 -mx-1.5 rounded-lg hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
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
      </motion.div>
    </div>
  );
}
