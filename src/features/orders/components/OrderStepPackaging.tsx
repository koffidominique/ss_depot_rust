import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { PreviewAllocation } from '../../../types/erp.ts';
import { formatFcfa } from '../../../utils/format.ts';

interface OrderStepPackagingProps {
  allocations: PreviewAllocation[];
  warnings: string[];
  isCustomOverride: boolean;
  onChangeAllocations: (next: PreviewAllocation[]) => void;
  onResetAuto: () => void;
}

export function OrderStepPackaging({
  allocations,
  warnings,
  isCustomOverride,
  onChangeAllocations,
  onResetAuto,
}: OrderStepPackagingProps) {
  const updateAlloc = (idx: number, patch: Partial<PreviewAllocation>) => {
    const next = allocations.map((a, i) => {
      if (i !== idx) return a;
      const merged = { ...a, ...patch };
      const dep = merged.is_consigned ? merged.deposit_amount_xof : 0;
      return { ...merged, total_deposit_xof: dep * merged.quantity };
    });
    onChangeAllocations(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#667085] dark:text-slate-400">
          Casiers physiques regroupés automatiquement par classe de compatibilité (un casier mixte
          génère <strong>1 seule consigne</strong>).
        </p>
        {isCustomOverride && (
          <button
            type="button"
            onClick={onResetAuto}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Recalculer auto
          </button>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {allocations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-5 text-center text-xs text-[#667085]">
          Aucun emballage physique requis (vente unitaire ou sans contenant consigné).
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900 text-[#667085]">
              <tr>
                <th className="px-3 py-2 font-medium">Emballage physique</th>
                <th className="px-3 py-2 font-medium">Classe</th>
                <th className="px-3 py-2 font-medium">Quantité</th>
                <th className="px-3 py-2 font-medium">Consigné</th>
                <th className="px-3 py-2 font-medium text-right">Consigne unitaire</th>
                <th className="px-3 py-2 font-medium text-right">Total consigne</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {allocations.map((a, idx) => (
                <tr key={`${a.packaging_asset_id}-${idx}`}>
                  <td className="px-3 py-2 font-medium">{a.packaging_name}</td>
                  <td className="px-3 py-2 font-mono-num text-[11px] text-[#667085]">
                    {a.compatibility_class}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      value={a.quantity}
                      onChange={(e) =>
                        updateAlloc(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono-num text-xs"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={a.is_consigned}
                      onChange={(e) => updateAlloc(idx, { is_consigned: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono-num">
                    {formatFcfa(a.deposit_amount_xof)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono-num font-semibold">
                    {formatFcfa(a.is_consigned ? a.quantity * a.deposit_amount_xof : 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
