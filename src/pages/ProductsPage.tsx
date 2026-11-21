import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Archive, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { InlineAlert } from '../components/common/InlineAlert.tsx';
import { ModalDialog } from '../components/dialogs/ModalDialog.tsx';
import { ErrorState, LoadingState } from '../components/common/States.tsx';
import { useUiStore } from '../stores/uiStore.ts';
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
import { CatalogPresetsModal } from '../features/products/components/CatalogPresetsModal.tsx';

/* ============================================================================
 * Page Catalogue Produits & Conditionnements
 * ============================================================================ */

export function ProductsPage() {
  const currentUser = useUiStore((s) => s.currentUser);
  const isOwner = currentUser?.role === 'owner';

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
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [presetsSubmitError, setPresetsSubmitError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
    catalogPresetsQuery,
    productsQuery,
  } = useProductsQueries(
    {
      search,
      categoryId,
      includeArchived,
      lowStockOnly,
      page,
    },
    presetsOpen,
  );

  const {
    saveProductMutation,
    archiveMutation,
    upsertPkgMutation,
    createCategoryMutation,
    importCsvMutation,
    deleteProductMutation,
    applyPresetsMutation,
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
    onDeletedProduct: (res) => {
      setDeleteTarget(null);
      setDeleteError(null);
      setFeedback(`Produit « ${res.name} » (${res.reference}) supprimé définitivement.`);
    },
    onDeleteError: (msg) => setDeleteError(msg),
    onAppliedPresets: (res) => {
      setPresetsOpen(false);
      setPresetsSubmitError(null);
      if (res.created > 0 || res.reactivated > 0) {
        setFeedback(
          `Catalogue brasseries appliqué : ${res.created} créé(s), ${res.reactivated} réactivé(s) (${res.skipped} inchangé(s)).`,
        );
      } else {
        setFeedback(`Tous les produits sélectionnés étaient déjà à jour (${res.skipped}).`);
      }
    },
    onPresetsError: (msg) => setPresetsSubmitError(msg),
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
        onOpenPresets={() => {
          setPresetsSubmitError(null);
          setPresetsOpen(true);
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
          canDelete={isOwner}
          onDelete={(prod) => {
            setDeleteError(null);
            setDeleteTarget(prod);
          }}
        />
      )}

      <ProductFormModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        editingProduct={editingProduct}
        existingProducts={data?.items}
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

      <CatalogPresetsModal
        open={presetsOpen}
        onOpenChange={(nextOpen) => {
          setPresetsOpen(nextOpen);
          if (!nextOpen) setPresetsSubmitError(null);
        }}
        items={catalogPresetsQuery.data?.items}
        isLoading={catalogPresetsQuery.isLoading}
        loadError={
          catalogPresetsQuery.error instanceof Error ? catalogPresetsQuery.error.message : null
        }
        submitError={presetsSubmitError}
        isPending={applyPresetsMutation.isPending}
        onApply={(keys, activate) => applyPresetsMutation.mutate({ keys, activate })}
      />

      <ModalDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        title={
          deleteTarget
            ? `Supprimer définitivement ${deleteTarget.name} ?`
            : 'Supprimer le produit'
        }
        subtitle="Action réservée au Propriétaire : la suppression définitive n'est possible que si le produit n'a aucun historique (ventes, achats, commandes ou mouvements de stock)."
        maxWidthClass="max-w-lg"
        error={deleteError}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium"
              >
                Annuler
              </button>
            </Dialog.Close>
            {deleteTarget && deleteTarget.is_active === 1 && (
              <button
                type="button"
                disabled={archiveMutation.isPending || deleteProductMutation.isPending}
                onClick={() => {
                  const target = deleteTarget;
                  archiveMutation.mutate(target, {
                    onSuccess: () => {
                      setDeleteTarget(null);
                      setDeleteError(null);
                    },
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2 text-xs font-medium text-[#D9901A]"
              >
                <Archive className="h-3.5 w-3.5" />
                Archiver à la place
              </button>
            )}
            <button
              type="button"
              disabled={!deleteTarget || deleteProductMutation.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                deleteProductMutation.mutate(deleteTarget.id);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC4545] px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleteProductMutation.isPending ? 'Suppression...' : 'Supprimer définitivement'}
            </button>
          </div>
        }
      >
        {deleteTarget && (
          <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3 text-xs text-[#667085] dark:text-slate-300 space-y-1">
            <div>
              Référence : <span className="font-mono-num font-semibold">{deleteTarget.reference}</span>
            </div>
            <div>
              Catégorie : {deleteTarget.category_name} · Unité : {deleteTarget.base_unit}
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}
