import { Controller, type UseFormReturn } from 'react-hook-form';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import { QuantityInput } from '../../../components/common/QuantityInput.tsx';
import { formatFcfa } from '../../../utils/format.ts';
import { PACKAGING_OPTIONS, type ProductFormValues } from '../utils/productSchemas.ts';

export function ProductStepUnitsAndPricing({
  form,
  isEditing,
}: {
  form: UseFormReturn<ProductFormValues>;
  isEditing: boolean;
}) {
  const purchase = form.watch('purchase_price') || 0;
  const retail = form.watch('retail_price') || 0;
  const wholesale = form.watch('wholesale_price') || 0;
  const marginRetail = retail - purchase;
  const marginWholesale = wholesale > 0 ? wholesale - purchase : 0;

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {!isEditing && (
        <>
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
              {...form.register('packaging_name')}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm capitalize"
            >
              {PACKAGING_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <Controller
            control={form.control}
            name="packaging_coeff"
            render={({ field, fieldState }) => (
              <QuantityInput
                label={`Unités par ${form.watch('packaging_name')}`}
                value={field.value}
                onChange={field.onChange}
                unit={form.watch('base_unit')}
                error={fieldState.error?.message}
              />
            )}
          />
        </>
      )}

      <Controller
        control={form.control}
        name="purchase_price"
        render={({ field, fieldState }) => (
          <MoneyInput
            label="Prix d'achat (FCFA)"
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="wholesale_price"
        render={({ field }) => (
          <MoneyInput label="Tarif gros (FCFA)" value={field.value} onChange={field.onChange} />
        )}
      />
      <Controller
        control={form.control}
        name="semi_wholesale_price"
        render={({ field }) => (
          <MoneyInput
            label="Tarif demi-gros (FCFA)"
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={form.control}
        name="retail_price"
        render={({ field, fieldState }) => (
          <MoneyInput
            label="Prix de vente détail (FCFA)"
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="min_selling_price"
        render={({ field }) => (
          <MoneyInput
            label="Prix plancher minimum (FCFA)"
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={form.control}
        name="bottle_deposit_amount"
        render={({ field }) => (
          <MoneyInput
            label="Consigne bouteille unitaire (FCFA)"
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={form.control}
        name="package_deposit_amount"
        render={({ field }) => (
          <MoneyInput
            label="Consigne casier / caisse (FCFA)"
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />

      <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs">
        <span>
          Marge détail :{' '}
          <strong className={marginRetail >= 0 ? 'text-[#16A36A]' : 'text-[#DC4545]'}>
            {formatFcfa(marginRetail)}
          </strong>
        </span>
        {wholesale > 0 && (
          <span>
            Marge gros :{' '}
            <strong className={marginWholesale >= 0 ? 'text-[#16A36A]' : 'text-[#DC4545]'}>
              {formatFcfa(marginWholesale)}
            </strong>
          </span>
        )}
      </div>

      <div className="sm:col-span-2 flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...form.register('allow_unit_sale')} />
          Autoriser vente unitaire
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...form.register('allow_mixed_sale')} />
          Autoriser panachage / demi-casier
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...form.register('allow_credit_sale')} />
          Autoriser vente à crédit
        </label>
      </div>
    </div>
  );
}
