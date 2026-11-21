import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Download, Plus, Upload } from 'lucide-react';
import { apiClient } from '../services/api/createApiClient.ts';
import { SearchInput } from '../components/forms/SearchInput.tsx';
import { InlineAlert } from '../components/common/InlineAlert.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { Product, ProductPackaging } from '../types/erp.ts';
import { compressLocalImage } from '../utils/image.ts';
import {
  buildNewPackagingState,
  buildPackagingStateFromExisting,
  categorySchema,
  productSchema,
  type CategoryFormValues,
  type PackagingFormState,
  type ProductFormValues,
} from '../features/products/utils/productSchemas.ts';
import {
  useProductMutations,
  useProductsQueries,
} from '../features/products/hooks/useProductsData.ts';
import { ProductsTable } from '../features/products/components/ProductsTable.tsx';
import { ProductFormModal } from '../features/products/components/ProductFormModal.tsx';
import { PackagingModal } from '../features/products/components/PackagingModal.tsx';
import { ImportCsvModal } from '../features/products/components/ImportCsvModal.tsx';
import { CategoryModal } from '../features/products/components/CategoryModal.tsx';

const INITIAL_PACKAGING_STATE: PackagingFormState = {
  id: undefined,
  name: 'casier',
  coefficient: '24',
  purchase_price: 0,
  wholesale_price: 0,
  semi_wholesale_price: 0,
  retail_price: 0,
  barcode: '',
  allow_fraction: false,
  is_active: true,
  deposit_mode: 'none',
  returnable_id: 0,
  returnable_pieces: 1,
  brand_name: '',
  brand_id: 0,
};

export function ProductsPage() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pkgProduct, setPkgProduct] = useState<Product | null>(null);
  const [pkgState, setPkgState] = useState<PackagingFormState>(INITIAL_PACKAGING_STATE);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const productForm = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      brand: '',
      barcode: '',
      category_id: 1,
      base_unit: 'bouteille',
      initial_stock: '0',
      min_stock: '24',
      purchase_price: 0,
      wholesale_price: 0,
      semi_wholesale_price: 0,
      retail_price: 0,
      image_path: null,
    },
  });

  const categoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', description: '' },
  });

  const { categoriesQuery, consignmentsQuery, productsQuery } = useProductsQueries({
    search,
    categoryId,
    includeArchived,
    lowStockOnly,
    page,
  });

  const {
    saveProductMutation,
    archiveMutation,
    upsertPkgMutation,
    createCategoryMutation,
    importCsvMutation,
  } = useProductMutations({
    onSavedProduct: () => {
      setCreateOpen(false);
      setEditingProduct(null);
      setFormError(null);
      setFeedback('Produit enregistré avec succès.');
    },
    onSavedPackaging: (isUpdate) => {
      setPkgProduct(null);
      setPkgState(INITIAL_PACKAGING_STATE);
      setFormError(null);
      setFeedback(isUpdate ? 'Conditionnement mis à jour.' : 'Conditionnement enregistré.');
    },
    onArchivedProduct: () => {
      setFeedback('Statut du produit mis à jour.');
    },
    onCreatedCategory: (created) => {
      setCatOpen(false);
      categoryForm.reset({ name: '', description: '' });
      setFormError(null);
      productForm.setValue('category_id', created.id);
      setFeedback(`Catégorie « ${created.name} » créée.`);
    },
    onImportedCsv: (created) => {
      setCsvOpen(false);
      setCsvText('');
      setFormError(null);
      setFeedback(`${created} produit(s) importé(s) depuis le CSV.`);
    },
    onError: (msg) => setFormError(msg),
  });

  const categories = categoriesQuery.data;
  const consignments = consignmentsQuery.data;
  const { data, isLoading, error, refetch } = productsQuery;

  const openPackagingModal = (prod: Product, targetPkg?: ProductPackaging) => {
    setPkgProduct(prod);
    setFormError(null);
    if (targetPkg) {
      setPkgState(buildPackagingStateFromExisting(targetPkg));
    } else if (prod.packagings.length > 0) {
      setPkgState(buildPackagingStateFromExisting(prod.packagings[0]));
    } else {
      setPkgState(buildNewPackagingState(prod));
    }
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    productForm.reset({
      name: '',
      brand: '',
      barcode: '',
      category_id: categories?.[0]?.id ?? 1,
      base_unit: 'bouteille',
      initial_stock: '0',
      min_stock: '24',
      purchase_price: 0,
      wholesale_price: 0,
      semi_wholesale_price: 0,
      retail_price: 0,
      image_path: null,
    });
    setFormError(null);
    setCreateOpen(true);
  };

  const openEditModal = (prod: Product) => {
    setEditingProduct(prod);
    productForm.reset({
      name: prod.name,
      brand: prod.brand || '',
      barcode: prod.barcode || '',
      category_id: prod.category_id,
      base_unit: prod.base_unit,
      initial_stock: '0',
      min_stock: String(prod.min_stock_milli / 1000),
      purchase_price: prod.purchase_price ?? 0,
      wholesale_price: prod.wholesale_price ?? 0,
      semi_wholesale_price: prod.semi_wholesale_price ?? 0,
      retail_price: prod.retail_price ?? 0,
      image_path: prod.image_path ?? null,
    });
    setFormError(null);
    setCreateOpen(true);
  };

  const handleImageFileChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await compressLocalImage(file, {
        maxSide: 256,
        quality: 0.82,
        maxLength: 350_000,
      });
      setFormError(null);
      productForm.setValue('image_path', dataUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur chargement photo produit.');
    }
  };

  const handleExportCsv = async () => {
    const csv = await apiClient.exportProductsCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'depotpro_produits.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {feedback && (
        <InlineAlert variant="success" message={feedback} onDismiss={() => setFeedback(null)} />
      )}

      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <SearchInput
            value={search}
            onChange={(next) => {
              setSearch(next);
              setPage(1);
            }}
            placeholder="Rechercher nom, réf, code-barres..."
            className="w-72"
            clearable
          />

          <select
            value={categoryId ?? ''}
            onChange={(e) => {
              setCategoryId(e.target.value ? Number(e.target.value) : undefined);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3 py-2 text-xs font-medium text-[#182230] dark:text-slate-200"
          >
            <option value="">Toutes les catégories</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setLowStockOnly((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              lowStockOnly
                ? 'border-[#D9901A] bg-amber-50 dark:bg-amber-950/30 text-[#D9901A]'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-[#667085] dark:text-slate-300'
            }`}
          >
            Stock faible
          </button>

          <button
            type="button"
            onClick={() => setIncludeArchived((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              includeArchived
                ? 'border-[#2563EB] bg-blue-50 dark:bg-blue-950/30 text-[#2563EB]'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] text-[#667085] dark:text-slate-300'
            }`}
          >
            Inclure archivés
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              categoryForm.reset({ name: '', description: '' });
              setFormError(null);
              setCatOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Catégorie
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setCsvOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111A2E] px-3.5 py-2 text-xs font-medium text-[#182230] dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nouveau produit
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Erreur de chargement.'}
          onRetry={() => refetch()}
        />
      ) : (
        <ProductsTable
          items={data.items}
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          onPageChange={setPage}
          onEdit={openEditModal}
          onManagePackagings={openPackagingModal}
          onToggleArchive={(prod) => archiveMutation.mutate(prod)}
        />
      )}

      <ProductFormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        editingProduct={editingProduct}
        form={productForm}
        categories={categories}
        error={formError}
        isPending={saveProductMutation.isPending}
        onSubmit={(values) => saveProductMutation.mutate({ editingProduct, values })}
        onImageFileChange={handleImageFileChange}
      />

      <PackagingModal
        product={pkgProduct}
        state={pkgState}
        onChangeState={setPkgState}
        onSelectExisting={(pk) => {
          setFormError(null);
          setPkgState(buildPackagingStateFromExisting(pk));
        }}
        onStartNew={(prod) => {
          setFormError(null);
          setPkgState(buildNewPackagingState(prod));
        }}
        returnableTypes={
          consignments?.types as Array<{ id: number; name: string; deposit_value: number }> | undefined
        }
        error={formError}
        isPending={upsertPkgMutation.isPending}
        onClose={() => {
          setPkgProduct(null);
          setPkgState(INITIAL_PACKAGING_STATE);
        }}
        onSubmit={() => {
          if (!pkgProduct) return;
          upsertPkgMutation.mutate({ productId: pkgProduct.id, pkg: pkgState });
        }}
      />

      <ImportCsvModal
        open={csvOpen}
        onOpenChange={setCsvOpen}
        csvText={csvText}
        onChangeCsvText={setCsvText}
        error={formError}
        isPending={importCsvMutation.isPending}
        onSubmit={() => importCsvMutation.mutate(csvText)}
      />

      <CategoryModal
        open={catOpen}
        onOpenChange={setCatOpen}
        form={categoryForm}
        error={formError}
        isPending={createCategoryMutation.isPending}
        onSubmit={(values) => createCategoryMutation.mutate(values)}
      />
    </div>
  );
}
