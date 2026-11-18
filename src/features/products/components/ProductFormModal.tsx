import { Controller, type UseFormReturn } from 'react-hook-form';
import * as Dialog from '@radix-ui/react-dialog';
import { Image as ImageIcon, Trash2 } from 'lucide-react';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import { MoneyInput } from '../../../components/common/MoneyInput.tsx';
import { QuantityInput } from '../../../components/common/QuantityInput.tsx';
import type { Category, Product } from '../../../types/erp.ts';
import type { ProductFormValues } from '../utils/productSchemas.ts';

interface ProductFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProduct: Product | null;
  form: UseFormReturn<ProductFormValues>;
  categories?: Category[];
  error: string | null;
  isPending: boolean;
  onSubmit: (values: ProductFormValues) => void;
  onImageFileChange: (file: File | undefined) => Promise<void>;
}

export function ProductFormModal({
  open,
  onOpenChange,
  editingProduct,
  form,
  categories,
  error,
  isPending,
  onSubmit,
  onImageFileChange,
}: ProductFormModalProps) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingProduct ? `Modifier ${editingProduct.name}` : 'Nouveau produit'}
      tipsTopicId="products"
      tipsLabel="Aide champs"
      maxWidthClass="max-w-xl"
      scrollable
      error={error}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
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
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
            {form.formState.errors.name && (
              <p className="mt-1 text-[11px] text-[#DC4545]" role="alert">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="product-brand"
              className="block text-xs font-medium text-[#182230] dark:text-slate-200"
            >
              Marque
            </label>
            <input
              id="product-brand"
              type="text"
              {...form.register('brand')}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="product-barcode"
              className="block text-xs font-medium text-[#182230] dark:text-slate-200"
            >
              Code-barres
            </label>
            <input
              id="product-barcode"
              type="text"
              {...form.register('barcode')}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="product-category"
              className="block text-xs font-medium text-[#182230] dark:text-slate-200"
            >
              Catégorie
            </label>
            <Controller
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <select
                  id="product-category"
                  value={field.value}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                >
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            />
          </div>
          {!editingProduct && (
            <div>
              <label
                htmlFor="product-base-unit"
                className="block text-xs font-medium text-[#182230] dark:text-slate-200"
              >
                Unité de base
              </label>
              <select
                id="product-base-unit"
                {...form.register('base_unit')}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              >
                <option value="bouteille">bouteille</option>
                <option value="canette">canette</option>
                <option value="pack">pack</option>
                <option value="carton">carton</option>
              </select>
            </div>
          )}
          {!editingProduct && (
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
            name="purchase_price"
            render={({ field, fieldState }) => (
              <MoneyInput
                label="Prix d'achat (unité base)"
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name="wholesale_price"
            render={({ field, fieldState }) => (
              <MoneyInput
                label="Prix gros"
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={form.control}
            name="semi_wholesale_price"
            render={({ field, fieldState }) => (
              <MoneyInput
                label="Prix demi-gros"
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
                label="Prix détail"
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
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
                <label className="cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                  Choisir une photo
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => void onImageFileChange(e.target.files?.[0])}
                  />
                </label>
                {form.watch('image_path') && (
                  <button
                    type="button"
                    onClick={() => form.setValue('image_path', null)}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900/50 px-2.5 py-1.5 text-xs font-medium text-[#DC4545] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Retirer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Dialog.Close asChild>
            <button
              type="button"
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
            >
              Annuler
            </button>
          </Dialog.Close>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
