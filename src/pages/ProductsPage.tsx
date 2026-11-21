import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { InlineAlert } from '../components/common/InlineAlert.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import type { Product, ProductPackaging } from '../types/erp.ts';
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
  INITIAL_PACKAGING_STATE,
  compressProductImageFile,
  createProductDefaultValues,
  downloadProductsCsvFile,
  editProductDefaultValues,
} from '../features/products/utils/productPageHelpers.ts';
import {
  useProductMutations,
  useProductsQueries,
} from '../features/products/hooks/useProductsData.ts';
import { ProductsToolbar } from '../features/products/components/ProductsToolbar.tsx';
import { ProductsTable } from '../features/products/components/ProductsTable.tsx';
import { ProductFormModal } from '../features/products/components/ProductFormModal.tsx';
import { PackagingModal } from '../features/products/components/PackagingModal.tsx';
import { ImportCsvModal } from '../features/products/components/ImportCsvModal.tsx';
import { CategoryModal } from '../features/products/components/CategoryModal.tsx';

/* ============================================================================
 * Page Catalogue Produits & Conditionnements
 * ============================================================================ */

export function ProductsPage() {
  /* --- 1. États locaux (filtres, pagination, modales) --- */
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

  /* --- 2. Formulaires React Hook Form --- */
  const productForm = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: createProductDefaultValues(),
  });

  const categoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', description: '' },
  });

  /* --- 3. Requêtes & Mutations TanStack Query --- */
  const {
    categoriesQuery,
    consignmentsQuery,
    breweriesQuery,
    brandsQuery,
    containerTypesQuery,
    packagingTypesQuery,
    stockLocationsQuery,
    suppliersQuery,
    productsQuery,
  } = useProductsQueries({
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
    onArchivedProduct: () => setFeedback('Statut du produit mis à jour.'),
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

  /* --- 4. Gestionnaires d'ouverture & d'actions --- */
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
    productForm.reset(createProductDefaultValues(categories));
    setFormError(null);
    setCreateOpen(true);
  };

  const openEditModal = (prod: Product) => {
    setEditingProduct(prod);
    productForm.reset(editProductDefaultValues(prod));
    setFormError(null);
    setCreateOpen(true);
  };

  const handleImageFileChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await compressProductImageFile(file);
      setFormError(null);
      productForm.setValue('image_path', dataUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erreur chargement photo produit.');
    }
  };

  /* --- 5. Rendu --- */
  return (
    <div className="space-y-5">
      {feedback && (
        <InlineAlert variant="success" message={feedback} onDismiss={() => setFeedback(null)} />
      )}

      <ProductsToolbar
        search={search}
        onSearchChange={(next) => {
          setSearch(next);
          setPage(1);
        }}
        categoryId={categoryId}
        onCategoryChange={(next) => {
          setCategoryId(next);
          setPage(1);
        }}
        categories={categories}
        lowStockOnly={lowStockOnly}
        onToggleLowStock={() => setLowStockOnly((v) => !v)}
        includeArchived={includeArchived}
        onToggleArchived={() => setIncludeArchived((v) => !v)}
        onOpenNewCategory={() => {
          categoryForm.reset({ name: '', description: '' });
          setFormError(null);
          setCatOpen(true);
        }}
        onExportCsv={() => void downloadProductsCsvFile()}
        onOpenImportCsv={() => {
          setFormError(null);
          setCsvOpen(true);
        }}
        onOpenNewProduct={openCreateModal}
      />

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
        breweries={breweriesQuery.data?.items}
        brands={brandsQuery.data?.items}
        containerTypes={containerTypesQuery.data?.items}
        packagingTypes={packagingTypesQuery.data}
        stockLocations={stockLocationsQuery.data}
        suppliers={suppliersQuery.data}
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
        categories={categories}
        error={formError}
        isPending={createCategoryMutation.isPending}
        onSubmit={(values) => createCategoryMutation.mutate(values)}
      />
    </div>
  );
}
