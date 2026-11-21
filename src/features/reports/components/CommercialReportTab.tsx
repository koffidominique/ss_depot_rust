import { AlertCircle, BarChart3 } from 'lucide-react';
import { MetricCard } from '../../../components/common/MetricCard.tsx';
import { MotionStaggerGrid } from '../../../components/motion/MotionPrimitives.tsx';
import type { ReportsOverview } from '../../../types/erp.ts';
import { formatDate, formatFcfa, formatNumber } from '../../../utils/format.ts';

interface CommercialReportTabProps {
  data: ReportsOverview;
  periodLabel: string;
}

export function CommercialReportTab({ data, periodLabel }: CommercialReportTabProps) {
  return (
    <>
      <MotionStaggerGrid className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="CA Marchandises (hors retour emballages)"
          value={formatFcfa(data.commercial.merchandise_revenue)}
          hint={`${formatNumber(data.commercial.count)} vente(s) validée(s)`}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <MetricCard
          label="Retour emballages facturés"
          value={formatFcfa(data.commercial.deposit_billed)}
          hint="Emballages consignés hors chiffre d'affaires"
        />
        <MetricCard
          label="Marge brute connue"
          value={formatFcfa(data.profitability.knownGrossMargin)}
          tone={data.profitability.knownGrossMargin >= 0 ? 'success' : 'danger'}
          hint={`Sur CA à coût connu : ${formatFcfa(data.profitability.knownCostRevenue)}`}
        />
        <MetricCard
          label="Valorisation stock connue"
          value={formatFcfa(data.stock.knownValuationFcfa)}
          hint={`${data.stock.product_count} produits actifs`}
        />
      </MotionStaggerGrid>

      {(data.profitability.unknownCostLines > 0 || data.stock.unknown_cost_products > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-xs text-[#D9901A]">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Transparence des coûts historiques</div>
            <p className="mt-0.5 text-[#667085] dark:text-slate-300">
              {data.profitability.unknownCostLines} ligne(s) de vente et{' '}
              {data.stock.unknown_cost_products} produit(s) ont un coût d&apos;achat non encore
              renseigné (aucun CUMP inventé : ces lignes sont exclues du calcul de marge connue).
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface-interactive p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold">
            Compte d&apos;exploitation synthétique (coûts connus)
          </h3>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            <div className="flex justify-between py-2.5">
              <span className="text-[#667085]">
                Chiffre d&apos;affaires marchandises à coût connu
              </span>
              <span className="font-mono-num font-semibold">
                {formatFcfa(data.profitability.knownCostRevenue)}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-[#667085]">
                Coût d&apos;achat des marchandises vendues (COGS)
              </span>
              <span className="font-mono-num text-[#DC4545]">
                - {formatFcfa(data.profitability.knownCostTotal)}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="font-medium">Marge brute connue</span>
              <span className="font-mono-num font-bold text-[#16A36A]">
                {formatFcfa(data.profitability.knownGrossMargin)}
              </span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-[#667085]">Dépenses d&apos;exploitation cumulées</span>
              <span className="font-mono-num text-[#DC4545]">
                - {formatFcfa(data.profitability.expensesTotal)}
              </span>
            </div>
            <div className="flex justify-between py-2.5 text-sm">
              <span className="font-semibold">Résultat net connu</span>
              <span
                className={`font-mono-num font-bold ${
                  data.profitability.netKnownResult >= 0 ? 'text-[#16A36A]' : 'text-[#DC4545]'
                }`}
              >
                {formatFcfa(data.profitability.netKnownResult)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface-interactive p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold">
            Ventilation des flux par moyen de paiement
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[#667085]">
                  <th className="py-2">Moyen</th>
                  <th className="py-2 text-right">Entrées</th>
                  <th className="py-2 text-right">Sorties</th>
                  <th className="py-2 text-right">Solde net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.paymentBreakdown.map((pm) => (
                  <tr key={pm.code}>
                    <td className="py-2.5 font-medium">
                      {pm.label}{' '}
                      <span className="text-[11px] text-[#667085]">
                        ({pm.is_cash === 1 ? 'Espèces' : 'Digital'})
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono-num text-[#16A36A]">
                      {formatFcfa(pm.total_in)}
                    </td>
                    <td className="py-2.5 text-right font-mono-num text-[#DC4545]">
                      {formatFcfa(pm.total_out)}
                    </td>
                    <td className="py-2.5 text-right font-mono-num font-semibold">
                      {formatFcfa(pm.total_in - pm.total_out)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {data.dailySales.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold">
            Détail journalier des ventes ({periodLabel})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-[#667085]">
                  <th className="py-2">Journée</th>
                  <th className="py-2 text-right">Ventes</th>
                  <th className="py-2 text-right">CA Marchandises</th>
                  <th className="py-2 text-right">Retour emballages</th>
                  <th className="py-2 text-right">Encaissé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.dailySales.map((d) => (
                  <tr key={d.day}>
                    <td className="py-2 font-mono-num">{formatDate(d.day)}</td>
                    <td className="py-2 text-right font-mono-num">{d.count}</td>
                    <td className="py-2 text-right font-mono-num font-semibold">
                      {formatFcfa(d.revenue)}
                    </td>
                    <td className="py-2 text-right font-mono-num text-[#D9901A]">
                      {formatFcfa(d.deposit)}
                    </td>
                    <td className="py-2 text-right font-mono-num text-[#16A36A]">
                      {formatFcfa(d.collected)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
