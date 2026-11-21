import type { UseFormReturn } from 'react-hook-form';
import type { Brewery, Category } from '../../../types/erp.ts';
import { formatFcfa } from '../../../utils/format.ts';
import type { ProductFormValues } from '../utils/productSchemas.ts';

function formatVolumeBadge(volumeMl: number | null): string {
  if (!volumeMl || volumeMl <= 0) return '';
  if (volumeMl >= 1000 && volumeMl % 100 === 0) {
    return `${(volumeMl / 1000).toString().replace('.', ',')} L`;
  }
  if (volumeMl % 10 === 0) {
    return `${volumeMl / 10} cl`;
  }
  return `${volumeMl} ml`;
}

function formatContainerSummary(values: ProductFormValues): string {
  const ct = values.container_type;
  if (ct === 'can' || values.container_material === 'aluminium') return 'Canette aluminium';
  if (ct === 'pet' || values.container_material === 'pet') return 'Bouteille PET';
  if (ct === 'glass_returnable' || (values.container_material === 'glass' && values.container_returnable)) {
    return 'Verre consigné';
  }
  if (ct === 'glass_disposable' || values.container_material === 'glass') {
    return values.container_recyclable ? 'Verre perdu recyclable' : 'Verre perdu';
  }
  return values.container_material || 'Standard';
}

export function ProductPreviewCard({
  form,
  breweries,
  categories,
}: {
  form: UseFormReturn<ProductFormValues>;
  breweries?: Brewery[];
  categories?: Category[];
}) {
  const v = form.watch();
  const breweryName = breweries?.find((b) => b.id === v.brewery_id)?.name;
  const catName = categories?.find((c) => c.id === v.category_id)?.name;
  const volBadge = formatVolumeBadge(v.volume_ml);
  const coeff = Number(v.packaging_coeff) || 1;
  const purchase = v.purchase_price || 0;
  const retail = v.retail_price || 0;
  const pkgDeposit = v.package_deposit_amount || 0;
  const margin = retail - purchase;
  const totalWithDeposit = retail + pkgDeposit;

  return (
    <aside className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 p-4 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <span className="font-semibold uppercase tracking-wide text-[11px] text-[#667085]">
          Aperçu fiche produit
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            v.status === 'active'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
          }`}
        >
          {v.status === 'active' ? 'Actif' : v.status === 'draft' ? 'Brouillon' : 'Inactif'}
        </span>
      </div>

      <div>
        <div className="font-display text-sm font-semibold text-[#182230] dark:text-slate-100">
          {v.name.trim() || 'Nouvelle référence'}{' '}
          {volBadge && <span className="text-[#2563EB]">— {volBadge}</span>}
        </div>
        <div className="mt-0.5 text-[#667085] dark:text-slate-400">
          {[breweryName || v.brand.trim(), catName, v.beverage_color.trim() || v.variant_label.trim()]
            .filter(Boolean)
            .join(' · ') || 'Identité à compléter'}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-200 dark:border-slate-800 pt-2">
        <div>
          <dt className="text-[11px] text-[#667085]">Contenant</dt>
          <dd className="font-medium text-[#182230] dark:text-slate-200">
            {formatContainerSummary(v)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#667085]">Conditionnement</dt>
          <dd className="font-medium capitalize text-[#182230] dark:text-slate-200">
            {v.packaging_name} × {coeff}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#667085]">Prix d&apos;achat</dt>
          <dd className="font-mono-num font-medium">{formatFcfa(purchase)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#667085]">Prix de vente</dt>
          <dd className="font-mono-num font-semibold text-[#182230] dark:text-slate-100">
            {formatFcfa(retail)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#667085]">Consigne emballage</dt>
          <dd className="font-mono-num">{formatFcfa(pkgDeposit)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#667085]">Marge brute estimée</dt>
          <dd className={`font-mono-num font-semibold ${margin >= 0 ? 'text-[#16A36A]' : 'text-[#DC4545]'}`}>
            {formatFcfa(margin)}
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2">
        <span className="text-[11px] font-medium text-[#667085]">Total client avec consigne</span>
        <span className="font-mono-num text-sm font-bold text-[#2563EB]">
          {formatFcfa(totalWithDeposit)}
        </span>
      </div>

      {v.sales_units.length > 0 && (
        <div className="text-[11px] text-[#667085]">
          Unités : {v.sales_units.map((u) => `${u.label} (×${u.conversion_factor})`).join(', ')}
        </div>
      )}
    </aside>
  );
}
