import { Controller, type UseFormReturn } from 'react-hook-form';
import type { ContainerTypeRef } from '../../../types/erp.ts';
import type { ProductFormValues } from '../utils/productSchemas.ts';

export { ProductStepUnitsAndPricing } from './ProductStepUnitsAndPricing.tsx';

interface ProductStepSpecsProps {
  form: UseFormReturn<ProductFormValues>;
  containerTypes?: ContainerTypeRef[];
}

export function ProductStepSpecs({ form, containerTypes }: ProductStepSpecsProps) {
  const isAlcoholic = form.watch('is_alcoholic');
  const isPerishable = form.watch('is_perishable');

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="block text-xs font-medium">Type de contenant</label>
        <Controller
          control={form.control}
          name="container_type_id"
          render={({ field }) => (
            <select
              value={field.value ?? ''}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                field.onChange(id);
                const ct = containerTypes?.find((x) => x.id === id);
                if (ct) {
                  const mappedType =
                    ct.material === 'glass'
                      ? ct.is_returnable === 1
                        ? 'glass_returnable'
                        : 'glass_disposable'
                      : ct.material === 'pet'
                        ? 'pet'
                        : ct.material === 'aluminium'
                          ? 'can'
                          : ct.material === 'plastic'
                            ? 'plastic_bottle'
                            : 'other';
                  form.setValue('container_type', mappedType);
                  if (ct.volume_ml) form.setValue('volume_ml', ct.volume_ml);
                  if (ct.material) {
                    form.setValue(
                      'container_material',
                      ct.material === 'wood' ? 'other' : ct.material
                    );
                  }
                  form.setValue('container_returnable', ct.is_returnable === 1);
                  form.setValue('container_recyclable', ct.is_recyclable === 1);
                  form.setValue('container_deposit_amount', ct.default_deposit_amount);
                }
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="">-- Libre / standard --</option>
              {containerTypes?.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.name} {ct.volume_ml ? `(${ct.volume_ml} ml)` : ''}
                </option>
              ))}
            </select>
          )}
        />
      </div>

      <div>
        <label className="block text-xs font-medium">Volume (ml)</label>
        <input
          type="number"
          min={0}
          value={form.watch('volume_ml') ?? ''}
          onChange={(e) =>
            form.setValue('volume_ml', e.target.value ? Number(e.target.value) : null)
          }
          placeholder="330, 500, 650, 1500..."
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium">Matière contenant</label>
        <select
          {...form.register('container_material')}
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="glass">Verre</option>
          <option value="pet">PET (Plastique)</option>
          <option value="aluminium">Aluminium (Canette)</option>
          <option value="carton">Carton / Tetra</option>
          <option value="plastic">Plastique</option>
          <option value="other">Autre</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium">Conservation / stockage</label>
        <input
          type="text"
          {...form.register('storage_temp')}
          placeholder="Ambiante, Frais 2-6°C..."
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
      </div>

      <div className="sm:col-span-2 flex flex-wrap gap-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...form.register('container_returnable')} />
          Contenant consigné
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...form.register('container_recyclable')} />
          Recyclable
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...form.register('is_alcoholic')} />
          Boisson alcoolisée
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...form.register('is_perishable')} />
          Produit périssable (DLC)
        </label>
      </div>

      {isAlcoholic && (
        <div>
          <label className="block text-xs font-medium">Degré d'alcool (% vol.)</label>
          <input
            type="text"
            {...form.register('alcohol_degree_str')}
            placeholder="Ex : 5.2"
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
          />
        </div>
      )}

      {isPerishable && (
        <div>
          <label className="block text-xs font-medium">Durée de vie (jours)</label>
          <input
            type="number"
            min={0}
            value={form.watch('shelf_life_days') ?? ''}
            onChange={(e) =>
              form.setValue('shelf_life_days', e.target.value ? Number(e.target.value) : null)
            }
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
          />
        </div>
      )}
    </div>
  );
}
