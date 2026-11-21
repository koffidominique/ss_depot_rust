import { Controller, type UseFormReturn } from 'react-hook-form';
import { QuantityInput } from '../../../components/common/QuantityInput.tsx';
import type { StockLocationRef, Supplier } from '../../../types/erp.ts';
import type { ProductFormValues } from '../utils/productSchemas.ts';

export function ProductStepStock({
  form,
  isEditing,
  locations,
}: {
  form: UseFormReturn<ProductFormValues>;
  isEditing: boolean;
  locations?: StockLocationRef[];
}) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {!isEditing && (
        <Controller
          control={form.control}
          name="initial_stock"
          render={({ field, fieldState }) => (
            <QuantityInput
              label="Stock initial"
              value={field.value}
              onChange={field.onChange}
              unit={form.watch('base_unit')}
              error={fieldState.error?.message}
            />
          )}
        />
      )}
      <Controller
        control={form.control}
        name="min_stock"
        render={({ field, fieldState }) => (
          <QuantityInput
            label="Seuil d'alerte minimum"
            value={field.value}
            onChange={field.onChange}
            unit={form.watch('base_unit')}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="max_stock"
        render={({ field, fieldState }) => (
          <QuantityInput
            label="Stock maximum cible"
            value={field.value}
            onChange={field.onChange}
            unit={form.watch('base_unit')}
            error={fieldState.error?.message}
          />
        )}
      />
      <div>
        <label className="block text-xs font-medium">Emplacement principal</label>
        <Controller
          control={form.control}
          name="default_location_id"
          render={({ field }) => (
            <select
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="">-- Dépôt principal (défaut) --</option>
              {locations?.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          )}
        />
      </div>
      <div>
        <label className="block text-xs font-medium">Statut catalogue</label>
        <select
          {...form.register('status')}
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="active">Actif (visible en vente)</option>
          <option value="draft">Brouillon</option>
          <option value="inactive">Inactif / archivé</option>
        </select>
      </div>
      <div className="sm:col-span-2 flex flex-wrap gap-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...form.register('track_batches')} />
          Suivi par lots
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...form.register('track_expiry')} />
          Suivi date de péremption (DLC)
        </label>
      </div>
    </div>
  );
}

export function ProductStepSuppliers({
  form,
  suppliers,
}: {
  form: UseFormReturn<ProductFormValues>;
  suppliers?: Supplier[];
}) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium">Fournisseur principal</label>
        <Controller
          control={form.control}
          name="supplier_id"
          render={({ field }) => (
            <select
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="">-- Aucun fournisseur affecté --</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        />
      </div>
      <div>
        <label className="block text-xs font-medium">Code article fournisseur</label>
        <input
          type="text"
          {...form.register('supplier_product_code')}
          placeholder="Ex : REF-SOL-001"
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium">Unité d'achat</label>
        <select
          {...form.register('purchase_unit')}
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="casier">casier</option>
          <option value="carton">carton</option>
          <option value="pack">pack</option>
          <option value="palette">palette</option>
          <option value="bouteille">bouteille</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium">Unités par colis d'achat</label>
        <input
          type="number"
          min={1}
          value={form.watch('units_per_purchase_package')}
          onChange={(e) =>
            form.setValue('units_per_purchase_package', Math.max(1, Number(e.target.value) || 1))
          }
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
        />
      </div>
    </div>
  );
}
