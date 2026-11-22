import { Layers, Plus, Trash2 } from 'lucide-react';
import type { OrderRequestedUnit } from '../../../types/erp.ts';
import { formatFcfa } from '../../../utils/format.ts';
import {
  resolveLocalFactor,
  type DraftOrderLine,
  type VariantOption,
} from '../utils/orderComposition.ts';

interface OrderStepLinesProps {
  lines: DraftOrderLine[];
  options: VariantOption[];
  onChangeLines: (next: DraftOrderLine[]) => void;
}

const UNIT_OPTIONS: Array<{ value: OrderRequestedUnit; label: string }> = [
  { value: 'unit', label: 'Unité' },
  { value: 'half_crate', label: 'Demi-casier' },
  { value: 'crate', label: 'Casier' },
  { value: 'carton', label: 'Carton' },
  { value: 'pack', label: 'Pack' },
];

function pluralBaseUnit(baseUnit: string): string {
  const unit = baseUnit.toLocaleLowerCase('fr');
  if (unit.includes('can')) return 'canettes';
  if (unit.includes('bouteille')) return 'bouteilles';
  return `${baseUnit}(s)`;
}

export function OrderStepLines({ lines, options, onChangeLines }: OrderStepLinesProps) {
  const optMap = new Map(options.map((o) => [o.variant_id, o]));

  const addLine = (presetUnit: OrderRequestedUnit = 'crate') => {
    const first = options[0];
    onChangeLines([
      ...lines,
      {
        key: `ln-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        product_id: first?.product_id ?? null,
        variant_id: first?.variant_id ?? null,
        requested_unit: presetUnit,
        requested_quantity: 1,
        unit_price_xof: first?.default_unit_price_xof ?? 0,
      },
    ]);
  };

  const addMixedCrate = () => {
    const first = options[0];
    const second = options.find((o) => o.variant_id !== first?.variant_id && o.compatibility_class === first?.compatibility_class) ?? options[1] ?? first;
    const stamp = Date.now();
    onChangeLines([
      ...lines,
      {
        key: `mix-a-${stamp}`,
        product_id: first?.product_id ?? null,
        variant_id: first?.variant_id ?? null,
        requested_unit: 'half_crate',
        requested_quantity: 1,
        unit_price_xof: first?.default_unit_price_xof ?? 0,
      },
      {
        key: `mix-b-${stamp}`,
        product_id: second?.product_id ?? null,
        variant_id: second?.variant_id ?? null,
        requested_unit: 'half_crate',
        requested_quantity: 1,
        unit_price_xof: second?.default_unit_price_xof ?? 0,
      },
    ]);
  };

  const updateLine = (key: string, patch: Partial<DraftOrderLine>) => {
    onChangeLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#667085] dark:text-slate-400">
          Les lignes compatibles dans un même casier (ex. 1/2 Bock + 1/2 Drogba 33cl) partagent
          automatiquement <strong>1 seul casier physique</strong>.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addMixedCrate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300"
          >
            <Layers className="h-3.5 w-3.5" />+ Ajouter un casier mixte
          </button>
          <button
            type="button"
            onClick={() => addLine('crate')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" />+ Ajouter une ligne produit
          </button>
        </div>
      </div>

      {lines.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-xs text-[#667085]">
          Aucune ligne produit ajoutée. Cliquez sur « + Ajouter une ligne produit » ou « + Ajouter
          un casier mixte ».
        </div>
      ) : (
        <div className="space-y-2">
          {lines.map((ln) => {
            const opt = ln.variant_id ? optMap.get(ln.variant_id) : undefined;
            const factor = opt ? resolveLocalFactor(ln.requested_unit, opt) : 1;
            const baseQty = ln.requested_quantity * factor;
            const lineTotal = baseQty * ln.unit_price_xof;
            return (
              <div
                key={ln.key}
                className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 dark:border-slate-800 p-3 sm:grid-cols-12 items-end"
              >
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-medium text-[#667085]">Variante boisson</label>
                  <select
                    value={ln.variant_id ?? ''}
                    onChange={(e) => {
                      const vid = e.target.value ? Number(e.target.value) : null;
                      const chosen = vid ? optMap.get(vid) : undefined;
                      updateLine(ln.key, {
                        variant_id: vid,
                        product_id: chosen?.product_id ?? null,
                        unit_price_xof: chosen?.default_unit_price_xof ?? ln.unit_price_xof,
                      });
                    }}
                    className="mt-0.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs"
                  >
                    <option value="">-- Choisir variante --</option>
                    {options.map((o) => (
                      <option key={o.variant_id} value={o.variant_id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-[#667085]">Unité</label>
                  <select
                    value={ln.requested_unit}
                    onChange={(e) =>
                      updateLine(ln.key, { requested_unit: e.target.value as OrderRequestedUnit })
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 rounded bg-blue-50 px-1.5 py-1 text-[10px] font-bold text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
                    1 {UNIT_OPTIONS.find((unit) => unit.value === ln.requested_unit)?.label.toLowerCase()} = {factor} {pluralBaseUnit(opt?.base_unit ?? 'bouteille')}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-[#667085]">
                    Qté ({baseQty} {pluralBaseUnit(opt?.base_unit ?? 'bouteille')})
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={ln.requested_quantity}
                    onChange={(e) =>
                      updateLine(ln.key, { requested_quantity: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium text-[#667085]">PU base (FCFA)</label>
                  <input
                    type="number"
                    min={0}
                    value={ln.unit_price_xof}
                    onChange={(e) =>
                      updateLine(ln.key, { unit_price_xof: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 font-mono-num text-xs"
                  />
                </div>
                <div className="sm:col-span-2 flex items-center justify-between gap-2 pb-1">
                  <span className="font-mono-num text-xs font-semibold">{formatFcfa(lineTotal)}</span>
                  <button
                    type="button"
                    onClick={() => onChangeLines(lines.filter((x) => x.key !== ln.key))}
                    className="rounded p-1 text-[#DC4545] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    title="Supprimer ligne"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
