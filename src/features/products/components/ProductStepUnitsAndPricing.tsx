import { Controller, type UseFormReturn } from 'react-hook-form';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import { formatFcfa } from '../../../utils/format.ts';
import type { ProductFormValues } from '../utils/productSchemas.ts';

export function ProductStepUnitsAndPricing({
  form,
}: {
  form: UseFormReturn<ProductFormValues>;
  isEditing?: boolean;
}) {
  const purchase = form.watch('purchase_price') || 0;
  const retail = form.watch('retail_price') || 0;
  const wholesale = form.watch('wholesale_price') || 0;
  const pkgDeposit = form.watch('package_deposit_amount') || 0;
  const pkgName = form.watch('packaging_name');
  const marginRetail = retail - purchase;
  const marginWholesale = wholesale > 0 ? wholesale - purchase : 0;
  const clientTotal = retail + pkgDeposit;

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Controller
        control={form.control}
        name="purchase_price"
        render={({ field, fieldState }) => (
          <MoneyInput
            label={`Prix d'achat fournisseur (${pkgName}, FCFA)`}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="retail_price"
        render={({ field, fieldState }) => (
          <MoneyInput
            label={`Prix de vente ${pkgName} (FCFA)`}
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
        name="unit_retail_price"
        render={({ field }) => (
          <MoneyInput
            label="Prix vente unitaire (bouteille/canette, FCFA)"
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={form.control}
        name="min_selling_price"
        render={({ field }) => (
          <MoneyInput
            label="Prix minimum autorisé (FCFA)"
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
            label="Consigne casier / emballage (FCFA)"
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

      <div className="sm:col-span-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-xs space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Marge brute estimée (hors consigne) :{' '}
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
          <span>
            Total client avec consigne :{' '}
            <strong className="text-[#2563EB]">{formatFcfa(clientTotal)}</strong>
          </span>
        </div>
        <p className="text-[11px] text-[#667085]">
          La consigne est comptabilisée séparément comme dépôt récupérable et n&apos;est pas
          incorporée à la marge commerciale.
        </p>
      </div>
    </div>
  );
}
