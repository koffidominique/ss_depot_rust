import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import * as Dialog from '@radix-ui/react-dialog';
import { ModalDialog } from '../../../components/dialogs/ModalDialog.tsx';
import type {
  BrandRef,
  Brewery,
  Category,
  ContainerTypeRef,
  PackagingTypeRef,
  Product,
  StockLocationRef,
  Supplier,
} from '../../../types/erp.ts';
import type { ProductFormValues } from '../utils/productSchemas.ts';
import { ProductStepIdentity } from './ProductStepIdentity.tsx';
import { ProductStepSpecs } from './ProductStepSpecsAndUnits.tsx';
import { ProductStepPackaging } from './ProductStepPackaging.tsx';
import { ProductStepSalesUnits } from './ProductStepSalesUnits.tsx';
import { ProductStepUnitsAndPricing } from './ProductStepUnitsAndPricing.tsx';
import { ProductStepStockAndSupplier } from './ProductStepStockAndSupplier.tsx';
import { ProductPreviewCard } from './ProductPreviewCard.tsx';

interface ProductFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProduct: Product | null;
  existingProducts?: Product[];
  form: UseFormReturn<ProductFormValues>;
  categories?: Category[];
  breweries?: Brewery[];
  brands?: BrandRef[];
  containerTypes?: ContainerTypeRef[];
  packagingTypes?: PackagingTypeRef[];
  stockLocations?: StockLocationRef[];
  suppliers?: Supplier[];
  error: string | null;
  isPending: boolean;
  onSubmit: (values: ProductFormValues) => void;
  onImageFileChange: (file: File | undefined) => Promise<void>;
}

const STEPS = [
  { id: 1, label: '1. Identité' },
  { id: 2, label: '2. Contenant' },
  { id: 3, label: '3. Emballage' },
  { id: 4, label: '4. Unités vente' },
  { id: 5, label: '5. Tarifs & consigne' },
  { id: 6, label: '6. Stock & fournisseur' },
] as const;

export function ProductFormModal({
  open,
  onOpenChange,
  editingProduct,
  existingProducts,
  form,
  categories,
  breweries,
  brands,
  containerTypes,
  packagingTypes,
  stockLocations,
  suppliers,
  error,
  isPending,
  onSubmit,
  onImageFileChange,
}: ProductFormModalProps) {
  const [step, setStep] = useState<number>(1);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setStep(1);
    onOpenChange(nextOpen);
  };

  return (
    <ModalDialog
      open={open}
      onOpenChange={handleOpenChange}
      title={editingProduct ? `Modifier ${editingProduct.name}` : 'Nouveau produit boisson'}
      tipsTopicId="products"
      tipsLabel="Aide champs"
      maxWidthClass="max-w-4xl"
      scrollable
      error={error}
    >
      <div className="mt-2 flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2.5">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              step === s.id
                ? 'bg-[#2563EB] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-[#667085] dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {step === 1 && (
              <ProductStepIdentity
                form={form}
                isEditing={Boolean(editingProduct)}
                editingProductId={editingProduct?.id ?? null}
                existingProducts={existingProducts}
                categories={categories}
                breweries={breweries}
                brands={brands}
                onImageFileChange={onImageFileChange}
              />
            )}
            {step === 2 && <ProductStepSpecs form={form} containerTypes={containerTypes} />}
            {step === 3 && (
              <ProductStepPackaging
                form={form}
                isEditing={Boolean(editingProduct)}
                packagingTypes={packagingTypes}
              />
            )}
            {step === 4 && (
              <ProductStepSalesUnits form={form} isEditing={Boolean(editingProduct)} />
            )}
            {step === 5 && (
              <ProductStepUnitsAndPricing form={form} isEditing={Boolean(editingProduct)} />
            )}
            {step === 6 && (
              <ProductStepStockAndSupplier
                form={form}
                isEditing={Boolean(editingProduct)}
                locations={stockLocations}
                suppliers={suppliers}
              />
            )}
          </div>

          <div className="lg:col-span-1 pt-4">
            <ProductPreviewCard form={form} breweries={breweries} categories={categories} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium"
              >
                Précédent
              </button>
            )}
            {step < 6 && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(6, s + 1))}
                className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs font-medium text-[#2563EB]"
              >
                Suivant
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
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
              className="rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </form>
    </ModalDialog>
  );
}
