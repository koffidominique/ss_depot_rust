import { Banknote, Landmark, Smartphone } from 'lucide-react';
import { MetricCard } from '../../../components/common/MetricCard.tsx';
import {
  MotionStaggerGrid,
  MotionStaggerItem,
} from '../../../components/motion/MotionPrimitives.tsx';
import type { CashStatus } from '../../../types/erp.ts';
import { formatFcfa } from '../../../utils/format.ts';

interface CashSummaryCardsProps {
  summary: NonNullable<CashStatus['summary']>;
  theoreticalCash: number;
  digitalNet: number;
}

export function CashSummaryCards({
  summary,
  theoreticalCash,
  digitalNet,
}: CashSummaryCardsProps) {
  return (
    <>
      <MotionStaggerGrid className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Espèces théoriques en tiroir"
          value={formatFcfa(theoreticalCash)}
          hint="Fond initial + entrées espèces - sorties espèces"
          icon={<Banknote className="h-4 w-4" />}
          tone="success"
        />
        <MetricCard
          label="Encaissements digitaux (session)"
          value={formatFcfa(digitalNet)}
          hint="Wave, Orange Money, MTN Money, Virement — hors tiroir espèces"
          icon={<Smartphone className="h-4 w-4" />}
        />
        <MetricCard
          label="Moyens actifs sur la session"
          value={String(summary.byMethod.length)}
          hint="Ventilation stricte espèces vs mobile money"
          icon={<Landmark className="h-4 w-4" />}
        />
      </MotionStaggerGrid>

      {summary.byMethod.length > 0 && (
        <MotionStaggerGrid className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.byMethod.map((m) => (
            <MotionStaggerItem
              key={m.method_code}
              interactive
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2E] dp-surface-interactive p-4"
            >
              <div className="flex items-center justify-between text-xs text-[#667085] dark:text-slate-400">
                <span className="font-medium text-[#182230] dark:text-slate-200">{m.label}</span>
                <span>{m.is_cash === 1 ? 'Espèces' : 'Digital'}</span>
              </div>
              <div className="mt-2 font-mono-num text-lg font-bold text-[#182230] dark:text-slate-100">
                {formatFcfa(m.total_in - m.total_out)}
              </div>
              <div className="mt-1 flex justify-between font-mono-num text-[11px] text-[#667085]">
                <span>Entrées : {formatFcfa(m.total_in)}</span>
                <span>Sorties : {formatFcfa(m.total_out)}</span>
              </div>
            </MotionStaggerItem>
          ))}
        </MotionStaggerGrid>
      )}
    </>
  );
}
