import { Controller, type UseFormReturn } from 'react-hook-form';
import { QuantityInput } from '../../../components/common/QuantityInput.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import type { PackagingTypeRef } from '../../../types/erp.ts';
import { packagingContentsLabel } from '../../../utils/format.ts';
import { PACKAGING_OPTIONS, type ProductFormValues } from '../utils/productSchemas.ts';

interface ProductStepPackagingProps {
  form: UseFormReturn<ProductFormValues>;
  isEditing: boolean;
  packagingTypes?: PackagingTypeRef[];
}

const COEFF_PRESETS = [1, 6, 12, 20, 24] as const;

export function ProductStepPackaging({
  form,
  isEditing,
  packagingTypes,
}: ProductStepPackagingProps) {
  const pkgName = form.watch('packaging_name');
  const baseUnit = form.watch('base_unit');
  const coeffNum = Math.max(0, Number(form.watch('packaging_coeff')) || 0);
  const volumeMl = form.watch('volume_ml') ?? 0;
  const totalVolumeMl = coeffNum * volumeMl;

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {!isEditing && (
        <>
          <div>
            <label htmlFor="product-packaging-type" className="block text-xs font-medium">
              Type d&apos;emballage commercial
            </label>
            <Controller
              control={form.control}
              name="packaging_type_id"
              render={({ field }) => (
                <select
                  id="product-packaging-type"
                  value={field.value ?? ''}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : null;
                    field.onChange(id);
                    const pt = packagingTypes?.find((x) => x.id === id);
                    if (pt) {
                      form.setValue('packaging_name', pt.default_name);
                      form.setValue('package_reusable', pt.is_reusable === 1);
                      form.setValue('package_returnable', pt.is_returnable === 1);
                      if (pt.is_returnable === 0) {
                        form.setValue('package_deposit_amount', 0);
                      }
                      if (pt.default_name === 'bouteille' || pt.default_name === 'canette') {
                        form.setValue('base_unit', pt.default_name);
                        form.setValue('packaging_coeff', '1');
                      }
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  <option value="">-- Standard / libre --</option>
                  {packagingTypes?.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.name}
                    </option>
                  ))}
                </select>
              )}
            />
          </div>

          <div>
            <label htmlFor="product-base-unit" className="block text-xs font-medium">
              Unité de base (stock)
            </label>
            <select
              id="product-base-unit"
              {...form.register('base_unit')}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="bouteille">bouteille</option>
              <option value="canette">canette</option>
              <option value="casier">casier</option>
              <option value="carton">carton</option>
              <option value="pack">pack</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium">Conditionnement principal</label>
            <select
              value={pkgName}
              onChange={(e) => {
                const next = e.target.value as ProductFormValues['packaging_name'];
                form.setValue('packaging_name', next);
                if (next === 'casier') {
                  form.setValue('package_reusable', true);
                  form.setValue('package_returnable', true);
                  if (coeffNum <= 1) form.setValue('packaging_coeff', '24');
                } else if (next === 'carton') {
                  form.setValue('package_reusable', false);
                  form.setValue('package_returnable', false);
                  form.setValue('package_deposit_amount', 0);
                  if (coeffNum <= 1) form.setValue('packaging_coeff', '24');
                } else if (next === 'pack') {
                  form.setValue('package_reusable', false);
                  form.setValue('package_returnable', false);
                  form.setValue('package_deposit_amount', 0);
                  if (coeffNum <= 1) form.setValue('packaging_coeff', '6');
                } else {
                  form.setValue('packaging_coeff', '1');
                }
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm capitalize"
            >
              {PACKAGING_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Controller
              control={form.control}
              name="packaging_coeff"
              render={({ field, fieldState }) => (
                <QuantityInput
                  label={`Unités par ${pkgName}`}
                  value={field.value}
                  onChange={field.onChange}
                  unit={baseUnit}
                  error={fieldState.error?.message}
                />
              )}
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {COEFF_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => form.setValue('packaging_coeff', String(n))}
                  className={`rounded border px-2 py-0.5 text-[11px] font-mono-num ${
                    String(n) === form.watch('packaging_coeff')
                      ? 'border-[#2563EB] bg-blue-50 text-[#2563EB] dark:bg-blue-950/40'
                      : 'border-slate-200 dark:border-slate-700 text-[#667085]'
                  }`}
                >
                  ×{n}
                </button>
              ))}
            </div>
            {coeffNum > 0 && (
              <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-bold text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                Contenu du conditionnement : {packagingContentsLabel(pkgName, baseUnit, Math.round(coeffNum * 1000))}
              </p>
            )}
          </div>
        </>
      )}

      <div>
        <label className="block text-xs font-medium">SKU conditionnement (optionnel)</label>
        <input
          type="text"
          {...form.register('package_sku')}
          placeholder="Ex : EMB-BOCK-24"
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
        />
      </div>

      <Controller
        control={form.control}
        name="package_cost"
        render={({ field }) => (
          <MoneyInput
            label="Coût emballage perdu / carton (FCFA)"
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />

      <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...form.register('package_reusable')} />
            Emballage réutilisable
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.watch('package_returnable')}
              onChange={(e) => {
                const checked = e.target.checked;
                form.setValue('package_returnable', checked);
                if (!checked) form.setValue('package_deposit_amount', 0);
              }}
            />
            Emballage consigné
          </label>
        </div>
        {totalVolumeMl > 0 && (
          <span className="font-mono-num text-[#667085] dark:text-slate-300">
            Volume total : <strong>{(totalVolumeMl / 1000).toFixed(2)} L</strong> ({totalVolumeMl}{' '}
            ml)
          </span>
        )}
      </div>

      {isEditing && (
        <p className="sm:col-span-2 text-xs text-[#667085] dark:text-slate-400">
          Les conditionnements existants se gèrent aussi directement depuis le bouton « Gérer » sur
          la fiche produit.
        </p>
      )}
    </div>
  );
}
