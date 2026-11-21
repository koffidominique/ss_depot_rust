import { Controller, type UseFormReturn } from 'react-hook-form';
import { AlertTriangle, Image as ImageIcon, Trash2 } from 'lucide-react';
import type { BrandRef, Brewery, Category, Product } from '../../../types/erp.ts';
import { normalizeProductName, type ProductFormValues } from '../utils/productSchemas.ts';
import { BrandQuickSelect, BreweryQuickSelect } from './ProductInlineRefs.tsx';

interface ProductStepIdentityProps {
  form: UseFormReturn<ProductFormValues>;
  isEditing: boolean;
  editingProductId?: number | null;
  existingProducts?: Product[];
  categories?: Category[];
  breweries?: Brewery[];
  brands?: BrandRef[];
  onImageFileChange: (file: File | undefined) => Promise<void>;
}

export function ProductStepIdentity({
  form,
  isEditing,
  editingProductId,
  existingProducts,
  categories,
  breweries,
  brands,
  onImageFileChange,
}: ProductStepIdentityProps) {
  const selectedCatId = form.watch('category_id');
  const watchedName = form.watch('name');
  const normalizedName = normalizeProductName(watchedName || '');
  const duplicateMatch =
    normalizedName.length > 0 && existingProducts
      ? existingProducts.find(
          (p) => p.id !== editingProductId && normalizeProductName(p.name) === normalizedName,
        ) ?? null
      : null;

  const rootCategories = categories?.filter((c) => !c.parent_id) ?? [];
  const subCategories = categories?.filter((c) => c.parent_id === selectedCatId) ?? [];

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label
          htmlFor="product-name"
          className="block text-xs font-medium text-[#182230] dark:text-slate-200"
        >
          Nom du produit *
        </label>
        <input
          id="product-name"
          type="text"
          aria-invalid={Boolean(form.formState.errors.name)}
          {...form.register('name')}
          placeholder="Ex : Bock Solibra 65cl ou Youki Cocktail 50cl"
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        {form.formState.errors.name && (
          <p className="mt-1 text-[11px] text-[#DC4545]" role="alert">
            {form.formState.errors.name.message}
          </p>
        )}
        {duplicateMatch && (
          <div
            role="status"
            className="mt-1.5 flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D9901A]" />
            <span>
              Doublon détecté : « {duplicateMatch.name} » ({duplicateMatch.reference}) existe déjà
              dans le catalogue.
            </span>
          </div>
        )}
      </div>

      <Controller
        control={form.control}
        name="brewery_id"
        render={({ field }) => (
          <BreweryQuickSelect
            form={form}
            breweries={breweries}
            brands={brands}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />

      <Controller
        control={form.control}
        name="brand_id"
        render={({ field }) => (
          <BrandQuickSelect
            form={form}
            brands={brands}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />

      <div>
        <label
          htmlFor="product-brand"
          className="block text-xs font-medium text-[#182230] dark:text-slate-200"
        >
          Libellé marque
        </label>
        <input
          id="product-brand"
          type="text"
          {...form.register('brand')}
          placeholder="Ex : Bock, Beaufort, Coca-Cola..."
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="product-variant-label"
          className="block text-xs font-medium text-[#182230] dark:text-slate-200"
        >
          Variante / arôme
        </label>
        <input
          id="product-variant-label"
          type="text"
          {...form.register('variant_label')}
          placeholder="Ex : Pomme, Cocktail, Zéro sucre..."
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="product-category"
          className="block text-xs font-medium text-[#182230] dark:text-slate-200"
        >
          Catégorie *
        </label>
        <Controller
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <select
              id="product-category"
              value={field.value}
              onChange={(e) => {
                field.onChange(Number(e.target.value));
                form.setValue('subcategory_id', null);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              {(rootCategories.length > 0 ? rootCategories : categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        />
      </div>

      <div>
        <label
          htmlFor="product-subcategory"
          className="block text-xs font-medium text-[#182230] dark:text-slate-200"
        >
          Sous-catégorie
        </label>
        <Controller
          control={form.control}
          name="subcategory_id"
          render={({ field }) => (
            <select
              id="product-subcategory"
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="">-- Aucune --</option>
              {subCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        />
      </div>

      <div>
        <label
          htmlFor="product-barcode"
          className="block text-xs font-medium text-[#182230] dark:text-slate-200"
        >
          Code-barres principal
        </label>
        <input
          id="product-barcode"
          type="text"
          {...form.register('barcode')}
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
        />
      </div>

      {!isEditing && (
        <div>
          <label
            htmlFor="product-sku"
            className="block text-xs font-medium text-[#182230] dark:text-slate-200"
          >
            SKU / Référence (auto si vide)
          </label>
          <input
            id="product-sku"
            type="text"
            {...form.register('sku')}
            placeholder="Ex : SOL-BOCK-65CL"
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
          />
        </div>
      )}

      <div className="sm:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
        <label className="block text-xs font-medium text-[#182230] dark:text-slate-200">
          Photo produit (optionnelle, redimensionnée automatiquement)
        </label>
        <div className="mt-2 flex items-center gap-3">
          {form.watch('image_path') ? (
            <img
              src={form.watch('image_path') || undefined}
              alt={form.watch('name') || 'Aperçu produit'}
              className="h-14 w-14 rounded-lg border border-slate-200 dark:border-slate-700 object-cover shrink-0"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 shrink-0">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                void onImageFileChange(e.target.files?.[0]);
                e.currentTarget.value = '';
              }}
              className="text-xs text-[#667085] file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#182230] dark:file:text-slate-200"
            />
            {form.watch('image_path') && (
              <button
                type="button"
                onClick={() => form.setValue('image_path', null)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs text-[#DC4545] hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Retirer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
