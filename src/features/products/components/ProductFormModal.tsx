import { Controller, type UseFormReturn } from 'react-hook-form';
import * as Dialog from '@radix-ui/react-dialog';
import { Image as ImageIcon, Trash2 } from 'lucide-react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import { QuantityInput } from '../../../components/common/QuantityInput.tsx';
import type { Category, Product, ProductFormMetadata } from '../../../types/erp.ts';
import type { ProductFormValues } from '../utils/productSchemas.ts';

interface ProductFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProduct: Product | null;
  form: UseFormReturn<ProductFormValues>;
  categories?: Category[];
  metadata?: ProductFormMetadata;
  error: string | null;
  isPending: boolean;
  onSubmit: (values: ProductFormValues) => void;
  onImageFileChange: (file: File | undefined) => Promise<void>;
}

const fieldClass =
  'mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm';

export function ProductFormModal({
  open,
  onOpenChange,
  editingProduct,
  form,
  categories,
  metadata,
  error,
  isPending,
  onSubmit,
  onImageFileChange,
}: ProductFormModalProps) {
  const selectedBreweryId = form.watch('brewery_id');
  const availableBrands = metadata?.brands.filter((brand) => brand.breweryId === selectedBreweryId) ?? [];
  const stockUnit = form.watch('base_unit');
  const isEditing = Boolean(editingProduct);

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingProduct ? `Modifier ${editingProduct.name}` : 'Nouveau produit'}
      tipsTopicId="products"
      tipsLabel="Aide champs"
      maxWidthClass="max-w-3xl"
      scrollable
      error={error}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="mt-4 space-y-5">
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Identification commerciale</h3>
              <p className="text-xs text-slate-500">Le producteur, la marque et le nom commercial du produit.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="product-brewery" className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Brasserie / producteur *
                </label>
                <Controller
                  control={form.control}
                  name="brewery_id"
                  render={({ field, fieldState }) => (
                    <>
                      <select
                        id="product-brewery"
                        value={field.value || 0}
                        onChange={(event) => {
                          const nextId = Number(event.target.value);
                          field.onChange(nextId);
                          const selectedBrand = metadata?.brands.find((brand) => brand.id === form.getValues('brand_id'));
                          if (selectedBrand && selectedBrand.breweryId !== nextId) {
                            form.setValue('brand_id', 0, { shouldValidate: true });
                            form.setValue('brand', '');
                          }
                        }}
                        className={fieldClass}
                      >
                        <option value={0}>Choisir une brasserie</option>
                        {metadata?.breweries.map((brewery) => (
                          <option key={brewery.id} value={brewery.id}>{brewery.name}</option>
                        ))}
                      </select>
                      {fieldState.error && <p className="mt-1 text-[11px] text-[#DC4545]">{fieldState.error.message}</p>}
                    </>
                  )}
                />
              </div>
              <div>
                <label htmlFor="product-brand" className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Marque *
                </label>
                <Controller
                  control={form.control}
                  name="brand_id"
                  render={({ field, fieldState }) => (
                    <>
                      <select
                        id="product-brand"
                        value={field.value || 0}
                        onChange={(event) => {
                          const nextId = Number(event.target.value);
                          field.onChange(nextId);
                          const brand = metadata?.brands.find((item) => item.id === nextId);
                          form.setValue('brand', brand?.name ?? '');
                        }}
                        className={fieldClass}
                        disabled={!selectedBreweryId || availableBrands.length === 0}
                      >
                        <option value={0}>Choisir une marque</option>
                        {availableBrands.map((brand) => (
                          <option key={brand.id} value={brand.id}>{brand.name}</option>
                        ))}
                      </select>
                      {fieldState.error && <p className="mt-1 text-[11px] text-[#DC4545]">{fieldState.error.message}</p>}
                    </>
                  )}
                />
                <input type="hidden" {...form.register('brand')} />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="product-name" className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Nom commercial du produit *
                </label>
                <input
                  id="product-name"
                  type="text"
                  aria-invalid={Boolean(form.formState.errors.name)}
                  {...form.register('name')}
                  className={fieldClass}
                  placeholder="Ex. Bock Lager"
                />
                {form.formState.errors.name && <p className="mt-1 text-[11px] text-[#DC4545]" role="alert">{form.formState.errors.name.message}</p>}
              </div>

              <div>
                <label htmlFor="product-category" className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Catégorie *
                </label>
                <Controller
                  control={form.control}
                  name="category_id"
                  render={({ field }) => (
                    <select
                      id="product-category"
                      value={field.value}
                      onChange={(event) => field.onChange(Number(event.target.value))}
                      className={fieldClass}
                    >
                      {categories?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  )}
                />
                {form.formState.errors.category_id && <p className="mt-1 text-[11px] text-[#DC4545]">{form.formState.errors.category_id.message}</p>}
              </div>
              <div>
                <label htmlFor="product-barcode" className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Code-barres (EAN/UPC)
                </label>
                <input id="product-barcode" type="text" {...form.register('barcode')} className={fieldClass} />
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Format physique</h3>
              <p className="text-xs text-slate-500">Une variante représente un contenant précis ; son volume est enregistré en millilitres.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="product-container" className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Type de contenant *
                </label>
                <Controller
                  control={form.control}
                  name="container_type"
                  render={({ field }) => (
                    <select
                      id="product-container"
                      value={field.value}
                      onChange={(event) => {
                        const next = event.target.value as ProductFormValues['container_type'];
                        field.onChange(next);
                        form.setValue('base_unit', next === 'can' ? 'canette' : 'bouteille');
                        if (next === 'can') form.setValue('packaging_type', 'carton');
                        else if (next === 'glass_returnable') form.setValue('packaging_type', 'casier');
                      }}
                      className={fieldClass}
                    >
                      <option value="glass_returnable">Bouteille en verre consignée</option>
                      <option value="glass_disposable">Bouteille en verre perdu</option>
                      <option value="pet">Bouteille PET</option>
                      <option value="plastic_bottle">Bouteille plastique</option>
                      <option value="can">Canette aluminium</option>
                      <option value="other">Autre contenant</option>
                    </select>
                  )}
                />
                {form.formState.errors.container_type && <p className="mt-1 text-[11px] text-[#DC4545]">{form.formState.errors.container_type.message}</p>}
              </div>
              <div>
                <label htmlFor="product-volume" className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Volume du contenant (ml) *
                </label>
                <input id="product-volume" type="number" min="1" step="1" {...form.register('volume_ml', { valueAsNumber: true })} className={fieldClass} placeholder="330" />
                {form.formState.errors.volume_ml && <p className="mt-1 text-[11px] text-[#DC4545]">{form.formState.errors.volume_ml.message}</p>}
              </div>
              <div>
                <label htmlFor="product-alcohol" className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Taux d'alcool (% vol.)
                </label>
                <input id="product-alcohol" type="number" min="0" max="100" step="0.1" {...form.register('alcohol_degree', { valueAsNumber: true })} className={fieldClass} />
                {form.formState.errors.alcohol_degree && <p className="mt-1 text-[11px] text-[#DC4545]">{form.formState.errors.alcohol_degree.message}</p>}
              </div>
              <div>
                <label htmlFor="product-variant-name" className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Désignation de la variante (facultatif)
                </label>
                <input id="product-variant-name" type="text" {...form.register('variant_name')} className={fieldClass} placeholder="Ex. Bock 33 cl verre" />
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Conditionnement commercial</h3>
              <p className="text-xs text-slate-500">
                Le stock est tenu à la bouteille ou à la canette ; le casier/carton est converti en ces unités.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="product-packaging-type" className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Conditionnement de vente initial
                </label>
                <Controller
                  control={form.control}
                  name="packaging_type"
                  render={({ field }) => (
                    <select id="product-packaging-type" value={field.value} onChange={(event) => field.onChange(event.target.value)} className={fieldClass} disabled={isEditing}>
                      <option value="casier">Casier</option>
                      <option value="carton">Carton</option>
                      <option value="pack">Pack</option>
                    </select>
                  )}
                />
              </div>
              <div>
                <label htmlFor="product-package-count" className="block text-xs font-medium text-[#182230] dark:text-slate-200">
                  Unités par conditionnement
                </label>
                <input id="product-package-count" type="number" min="1" max="500" step="1" {...form.register('units_per_package', { valueAsNumber: true })} className={fieldClass} disabled={isEditing} />
                {form.formState.errors.units_per_package && <p className="mt-1 text-[11px] text-[#DC4545]">{form.formState.errors.units_per_package.message}</p>}
              </div>
            </div>
            {isEditing && <p className="text-[11px] text-slate-500">Pour modifier les conditionnements, utilisez « Gérer les conditionnements » afin de ne pas écraser les coefficients déjà utilisés dans les ventes.</p>}
          </section>

          <section className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Stock et prix de référence</h3>
              <p className="text-xs text-slate-500">Les prix sont exprimés en FCFA par unité de stock, pas par casier.</p>
            </div>
            <input type="hidden" {...form.register('base_unit')} />
            <p className="text-xs text-slate-600 dark:text-slate-400">Unité de stock calculée : <strong>{stockUnit}</strong></p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {!isEditing && (
                <Controller
                  control={form.control}
                  name="initial_stock"
                  render={({ field, fieldState }) => (
                    <QuantityInput label="Stock initial" value={field.value} onChange={field.onChange} unit={stockUnit} error={fieldState.error?.message} />
                  )}
                />
              )}
              <Controller
                control={form.control}
                name="min_stock"
                render={({ field, fieldState }) => (
                  <QuantityInput label="Seuil d'alerte minimum" value={field.value} onChange={field.onChange} unit={stockUnit} error={fieldState.error?.message} />
                )}
              />
              <Controller
                control={form.control}
                name="purchase_price"
                render={({ field, fieldState }) => (
                  <MoneyInput label="Prix d'achat par unité (FCFA)" value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
                )}
              />
              <Controller
                control={form.control}
                name="retail_price"
                render={({ field, fieldState }) => (
                  <MoneyInput label="Prix de vente détail par unité (FCFA)" value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
                )}
              />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
            <label className="block text-xs font-medium text-[#182230] dark:text-slate-200">
              Photo produit (optionnelle, redimensionnée automatiquement)
            </label>
            <div className="mt-2 flex items-center gap-3">
              {form.watch('image_path') ? (
                <img src={form.watch('image_path') || undefined} alt={form.watch('name') || 'Aperçu produit'} className="h-14 w-14 rounded-lg border border-slate-200 dark:border-slate-700 object-cover shrink-0" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-400 shrink-0">
                  <ImageIcon className="h-5 w-5" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                  Choisir une photo
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void onImageFileChange(event.target.files?.[0])} />
                </label>
                {form.watch('image_path') && (
                  <button type="button" onClick={() => form.setValue('image_path', null)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/50 px-2.5 py-1.5 text-xs font-medium text-[#DC4545] hover:bg-rose-50 dark:hover:bg-rose-950/30">
                    <Trash2 className="h-3.5 w-3.5" /> Retirer
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Dialog.Close asChild>
            <button type="button" className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">Annuler</button>
          </Dialog.Close>
          <button type="submit" disabled={isPending} className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {isPending ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
