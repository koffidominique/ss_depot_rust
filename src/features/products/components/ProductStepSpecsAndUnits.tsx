import { Controller, type UseFormReturn } from 'react-hook-form';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import type { ContainerTypeRef } from '../../../types/erp.ts';
import type { ProductFormValues } from '../utils/productSchemas.ts';

interface ProductStepSpecsProps {
  form: UseFormReturn<ProductFormValues>;
  containerTypes?: ContainerTypeRef[];
}

const VOLUME_PRESETS = [
  { label: '25 cl', ml: 250 },
  { label: '30 cl', ml: 300 },
  { label: '33 cl', ml: 330 },
  { label: '50 cl', ml: 500 },
  { label: '65 cl', ml: 650 },
  { label: '1 L', ml: 1000 },
  { label: '1,5 L', ml: 1500 },
  { label: '2 L', ml: 2000 },
] as const;

export function ProductStepSpecs({ form, containerTypes }: ProductStepSpecsProps) {
  const isAlcoholic = form.watch('is_alcoholic');
  const isPerishable = form.watch('is_perishable');
  const containerType = form.watch('container_type');
  const containerReturnable = form.watch('container_returnable');
  const isCan = containerType === 'can' || form.watch('container_material') === 'aluminium';

  const applyContainerDefaults = (ct: ContainerTypeRef) => {
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
    const vol = ct.default_volume_ml ?? ct.volume_ml ?? null;
    if (vol) form.setValue('volume_ml', vol);
    if (ct.material) {
      form.setValue('container_material', ct.material === 'wood' ? 'other' : ct.material);
    }
    const ret = ct.is_returnable === 1;
    form.setValue('container_returnable', ret);
    form.setValue('container_recyclable', ct.is_recyclable === 1);
    form.setValue(
      'container_deposit_amount',
      ret ? (ct.default_deposit_value ?? ct.default_deposit_amount ?? 0) : 0,
    );
    if (mappedType === 'can') {
      form.setValue('base_unit', 'canette');
      form.setValue('packaging_name', 'carton');
      form.setValue('package_reusable', false);
      form.setValue('package_returnable', false);
    } else if (mappedType === 'glass_returnable') {
      form.setValue('base_unit', 'bouteille');
      form.setValue('packaging_name', 'casier');
      form.setValue('package_reusable', true);
      form.setValue('package_returnable', true);
    } else if (mappedType === 'pet') {
      form.setValue('base_unit', 'bouteille');
      form.setValue('packaging_name', 'pack');
      form.setValue('package_reusable', false);
      form.setValue('package_returnable', false);
    }
  };

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
                if (ct) applyContainerDefaults(ct);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="">-- Libre / standard --</option>
              {containerTypes?.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.name} {(ct.default_volume_ml ?? ct.volume_ml) ? `(${ct.default_volume_ml ?? ct.volume_ml} ml)` : ''}
                </option>
              ))}
            </select>
          )}
        />
      </div>

      <div>
        <label className="block text-xs font-medium">Matière contenant</label>
        <select
          value={form.watch('container_material')}
          onChange={(e) => {
            const mat = e.target.value;
            form.setValue('container_material', mat);
            if (mat === 'aluminium') {
              form.setValue('container_type', 'can');
              form.setValue('container_returnable', false);
              form.setValue('container_deposit_amount', 0);
            } else if (mat === 'pet') {
              form.setValue('container_type', 'pet');
            } else if (mat === 'glass') {
              form.setValue(
                'container_type',
                form.getValues('container_returnable') ? 'glass_returnable' : 'glass_disposable',
              );
            }
          }}
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="glass">Verre</option>
          <option value="pet">PET (Plastique)</option>
          <option value="aluminium">Aluminium (Canette)</option>
          <option value="carton">Carton / Tetra</option>
          <option value="plastic">Plastique (Sachet)</option>
          <option value="other">Autre</option>
        </select>
      </div>

      <div className="sm:col-span-2">
        <label className="block text-xs font-medium">Volume normalisé (ml) — préréglages ou libre</label>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {VOLUME_PRESETS.map((p) => (
            <button
              key={p.ml}
              type="button"
              onClick={() => form.setValue('volume_ml', p.ml)}
              className={`rounded-md border px-2 py-1 text-xs font-medium ${
                form.watch('volume_ml') === p.ml
                  ? 'border-[#2563EB] bg-blue-50 text-[#2563EB] dark:bg-blue-950/40'
                  : 'border-slate-200 dark:border-slate-700 text-[#667085]'
              }`}
            >
              {p.label}
            </button>
          ))}
          <input
            type="number"
            min={0}
            value={form.watch('volume_ml') ?? ''}
            onChange={(e) =>
              form.setValue('volume_ml', e.target.value ? Number(e.target.value) : null)
            }
            placeholder="ml..."
            className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 font-mono-num text-sm"
          />
        </div>
      </div>

      {!isCan && (
        <div className="sm:col-span-2 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={containerReturnable}
              onChange={(e) => {
                const checked = e.target.checked;
                form.setValue('container_returnable', checked);
                if (form.getValues('container_material') === 'glass') {
                  form.setValue('container_type', checked ? 'glass_returnable' : 'glass_disposable');
                }
                if (!checked) form.setValue('container_deposit_amount', 0);
              }}
            />
            Contenant consigné / réutilisable
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...form.register('container_recyclable')} />
            Verre / matériau recyclable
          </label>
          {containerReturnable && (
            <div className="w-48">
              <Controller
                control={form.control}
                name="container_deposit_amount"
                render={({ field }) => (
                  <MoneyInput
                    label="Consigne contenant (FCFA)"
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium">Couleur / style boisson</label>
        <input
          type="text"
          {...form.register('beverage_color')}
          placeholder="Blonde, brune, tonic, orange..."
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
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

      <div className="sm:col-span-2 flex flex-wrap gap-4 text-xs">
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
          <label className="block text-xs font-medium">Degré d&apos;alcool (% vol.)</label>
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
          <label className="block text-xs font-medium">Durée de conservation (jours)</label>
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

      <div className="sm:col-span-2">
        <label className="block text-xs font-medium">Composition / ingrédients (optionnel)</label>
        <input
          type="text"
          {...form.register('ingredients')}
          placeholder="Eau, malt d'orge, houblon..."
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
