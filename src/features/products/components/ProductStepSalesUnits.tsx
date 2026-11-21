import type { UseFormReturn } from 'react-hook-form';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import type { SalesUnitType } from '../../../types/erp.ts';
import { buildStandardSalesUnits } from '../utils/productPageHelpers.ts';
import type { ProductFormValues, SalesUnitDraft } from '../utils/productSchemas.ts';

const UNIT_TYPE_LABELS: Array<{ value: SalesUnitType; label: string }> = [
  { value: 'bottle', label: 'Bouteille' },
  { value: 'can', label: 'Canette' },
  { value: 'pack', label: 'Pack' },
  { value: 'half_crate', label: 'Demi-casier (virtuel)' },
  { value: 'crate', label: 'Casier' },
  { value: 'carton', label: 'Carton' },
  { value: 'film', label: 'Film' },
  { value: 'pallet', label: 'Palette' },
  { value: 'custom', label: 'Autre' },
];

export function ProductStepSalesUnits({
  form,
  isEditing,
}: {
  form: UseFormReturn<ProductFormValues>;
  isEditing: boolean;
}) {
  const units = form.watch('sales_units');
  const pkgName = form.watch('packaging_name');
  const baseUnit = form.watch('base_unit');
  const pkgCoeff = form.watch('packaging_coeff');
  const retailPrice = form.watch('retail_price');
  const unitRetailPrice = form.watch('unit_retail_price');

  const updateRow = (index: number, patch: Partial<SalesUnitDraft>) => {
    const next = units.map((u, idx) => {
      if (patch.is_default_sale && idx !== index) {
        return { ...u, is_default_sale: false };
      }
      return idx === index ? { ...u, ...patch } : u;
    });
    form.setValue('sales_units', next);
  };

  const addUnit = () => {
    form.setValue('sales_units', [
      ...units,
      {
        label: 'Nouvelle unité',
        unit_type: 'custom',
        conversion_factor: 1,
        is_virtual: false,
        allow_fraction: false,
        retail_price: null,
        wholesale_price: null,
        semi_wholesale_price: null,
        min_selling_price: null,
        is_default_sale: units.length === 0,
      },
    ]);
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2">
        <p className="text-xs text-[#667085] dark:text-slate-300">
          Configurez plusieurs unités commerciales (ex. Bouteille × 1, Demi-casier virtuel × 12,
          Casier × 24) sur la même fiche.
        </p>
        {!isEditing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                form.setValue(
                  'sales_units',
                  buildStandardSalesUnits(
                    pkgName,
                    baseUnit,
                    pkgCoeff,
                    retailPrice,
                    unitRetailPrice,
                  ),
                )
              }
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 text-xs font-medium text-[#2563EB]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Générer unités standard
            </button>
            <button
              type="button"
              onClick={addUnit}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-medium"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          </div>
        )}
      </div>

      {units.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-xs text-[#667085]">
          {isEditing
            ? 'Aucune unité commerciale spécifique enregistrée.'
            : 'Aucune unité personnalisée ajoutée : le conditionnement principal sera utilisé automatiquement, ou cliquez sur « Générer unités standard ».'}
        </div>
      ) : (
        <div className="space-y-2">
          {units.map((u, idx) => (
            <div
              key={`${u.unit_type}-${idx}`}
              className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 sm:grid-cols-12 items-center"
            >
              <div className="sm:col-span-4">
                <input
                  type="text"
                  disabled={isEditing}
                  value={u.label}
                  onChange={(e) => updateRow(idx, { label: e.target.value })}
                  placeholder="Libellé"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                />
              </div>
              <div className="sm:col-span-3">
                <select
                  disabled={isEditing}
                  value={u.unit_type}
                  onChange={(e) =>
                    updateRow(idx, {
                      unit_type: e.target.value as SalesUnitType,
                      is_virtual: e.target.value === 'half_crate',
                    })
                  }
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs"
                >
                  {UNIT_TYPE_LABELS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <input
                  type="number"
                  min={1}
                  disabled={isEditing}
                  value={u.conversion_factor}
                  onChange={(e) =>
                    updateRow(idx, {
                      conversion_factor: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  title="Facteur de conversion"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono-num text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <input
                  type="number"
                  min={0}
                  disabled={isEditing}
                  value={u.retail_price ?? ''}
                  onChange={(e) =>
                    updateRow(idx, {
                      retail_price: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder="Prix détail"
                  className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono-num text-xs"
                />
              </div>
              <div className="sm:col-span-1 flex items-center justify-end gap-1">
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() =>
                      form.setValue(
                        'sales_units',
                        units.filter((_, i) => i !== idx),
                      )
                    }
                    className="rounded p-1 text-[#DC4545] hover:bg-red-50 dark:hover:bg-red-950/30"
                    title="Supprimer l'unité"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="sm:col-span-12 flex flex-wrap gap-4 text-[11px] text-[#667085]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={isEditing}
                    checked={u.is_virtual}
                    onChange={(e) => updateRow(idx, { is_virtual: e.target.checked })}
                  />
                  Unité virtuelle (ex. demi-casier)
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={isEditing}
                    checked={u.is_default_sale}
                    onChange={(e) => updateRow(idx, { is_default_sale: e.target.checked })}
                  />
                  Unité de vente par défaut
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
