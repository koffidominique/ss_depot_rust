import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import type {
  ApplyCatalogPresetsResult,
  Category,
  DeleteProductResult,
  Product,
} from '../../../types/erp.ts';
import type {
  CategoryFormValues,
  PackagingFormState,
  ProductFormValues,
} from '../utils/productSchemas.ts';

export interface ProductFilters {
  search: string;
  categoryId?: number;
  includeArchived: boolean;
  lowStockOnly: boolean;
  page: number;
  pageSize?: number;
  presetsOpen?: boolean;
}

export function useProductsQueries(filters: ProductFilters) {
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.listCategories(),
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiClient.listSuppliers(),
  });

  const consignmentsQuery = useQuery({
    queryKey: ['consignments'],
    queryFn: () => apiClient.getConsignmentsOverview(),
  });

  const catalogPresetsQuery = useQuery({
    queryKey: ['catalogPresets'],
    queryFn: () => apiClient.listCatalogPresets(),
    enabled: Boolean(filters.presetsOpen),
  });

  const productsQuery = useQuery({
    queryKey: [
      'products',
      filters.search,
      filters.categoryId,
      filters.includeArchived,
      filters.lowStockOnly,
      filters.page,
    ],
    queryFn: () =>
      apiClient.listProducts({
        search: filters.search,
        categoryId: filters.categoryId,
        includeArchived: filters.includeArchived,
        lowStockOnly: filters.lowStockOnly,
        page: filters.page,
        pageSize: filters.pageSize ?? 20,
      }),
  });

  return {
    categoriesQuery,
    suppliersQuery,
    consignmentsQuery,
    catalogPresetsQuery,
    productsQuery,
  };
}

export function useProductMutations(callbacks: {
  onSavedProduct: () => void;
  onSavedPackaging: (isUpdate: boolean) => void;
  onArchivedProduct: () => void;
  onDeletedProduct?: (result: DeleteProductResult) => void;
  onDeleteError?: (message: string) => void;
  onCreatedCategory: (cat: Category) => void;
  onImportedCsv: (createdCount: number) => void;
  onAppliedPresets?: (result: ApplyCatalogPresetsResult) => void;
  onError: (message: string) => void;
}) {
  const qc = useQueryClient();

  const saveProductMutation = useMutation({
    mutationFn: async ({
      editingProduct,
      values,
    }: {
      editingProduct: Product | null;
      values: ProductFormValues;
    }) => {
      if (editingProduct) {
        return apiClient.updateProduct(editingProduct.id, {
          name: values.name.trim(),
          brand: values.brand.trim(),
          barcode: values.barcode.trim() || null,
          category_id: values.category_id,
          supplier_id: values.supplier_id,
          min_stock: values.min_stock || '0',
          purchase_price: values.purchase_price,
          wholesale_price: values.wholesale_price,
          semi_wholesale_price: values.semi_wholesale_price,
          retail_price: values.retail_price,
          image_path: values.image_path,
          is_active: values.is_active,
        });
      }
      return apiClient.createProduct({
        name: values.name.trim(),
        brand: values.brand.trim(),
        barcode: values.barcode.trim() || null,
        category_id: values.category_id,
        supplier_id: values.supplier_id,
        base_unit: values.base_unit,
        initial_stock: values.initial_stock || '0',
        min_stock: values.min_stock || '0',
        purchase_price: values.purchase_price,
        wholesale_price: values.wholesale_price,
        semi_wholesale_price: values.semi_wholesale_price,
        retail_price: values.retail_price,
        image_path: values.image_path,
        is_active: values.is_active,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['catalogPresets'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      callbacks.onSavedProduct();
    },
    onError: (err) =>
      callbacks.onError(err instanceof Error ? err.message : 'Erreur de validation.'),
  });

  const archiveMutation = useMutation({
    mutationFn: (prod: Product) => apiClient.updateProduct(prod.id, { is_active: !prod.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['catalogPresets'] });
      callbacks.onArchivedProduct();
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: (productId: number) => apiClient.deleteProduct(productId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['catalogPresets'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      callbacks.onDeletedProduct?.(res);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Erreur lors de la suppression.';
      if (callbacks.onDeleteError) callbacks.onDeleteError(msg);
      else callbacks.onError(msg);
    },
  });

  const upsertPkgMutation = useMutation({
    mutationFn: ({
      productId,
      pkg,
    }: {
      productId: number;
      pkg: PackagingFormState;
    }) =>
      apiClient.upsertPackaging(productId, {
        id: pkg.id,
        name: pkg.name,
        coefficient: pkg.coefficient,
        purchase_price: pkg.purchase_price,
        wholesale_price: pkg.wholesale_price,
        semi_wholesale_price: pkg.semi_wholesale_price,
        retail_price: pkg.retail_price,
        barcode: pkg.barcode || null,
        allow_fraction: pkg.allow_fraction,
        is_active: pkg.is_active,
        deposit_mode: pkg.deposit_mode,
        components:
          pkg.deposit_mode === 'deposit' && pkg.returnable_id > 0
            ? [{ returnable_id: pkg.returnable_id, pieces_per_pack: pkg.returnable_pieces }]
            : [],
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      callbacks.onSavedPackaging(Boolean(variables.pkg.id));
    },
    onError: (err) =>
      callbacks.onError(err instanceof Error ? err.message : 'Erreur conditionnement.'),
  });

  const createCategoryMutation = useMutation({
    mutationFn: (vals: CategoryFormValues) =>
      apiClient.createCategory(vals.name.trim(), vals.description.trim() || undefined),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      callbacks.onCreatedCategory(created);
    },
    onError: (err) =>
      callbacks.onError(err instanceof Error ? err.message : 'Erreur création catégorie.'),
  });

  const importCsvMutation = useMutation({
    mutationFn: (csvText: string) => apiClient.importProductsCsv(csvText),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      callbacks.onImportedCsv(res.created);
    },
    onError: (err) =>
      callbacks.onError(err instanceof Error ? err.message : 'Erreur import CSV.'),
  });

  const applyPresetsMutation = useMutation({
    mutationFn: (input: { keys: string[]; activate: boolean }) =>
      apiClient.applyCatalogPresets(input),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      qc.invalidateQueries({ queryKey: ['consignments'] });
      qc.invalidateQueries({ queryKey: ['catalogPresets'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      callbacks.onAppliedPresets?.(res);
    },
    onError: (err) =>
      callbacks.onError(
        err instanceof Error ? err.message : 'Erreur chargement catalogue brasseries.'
      ),
  });

  return {
    saveProductMutation,
    archiveMutation,
    deleteProductMutation,
    upsertPkgMutation,
    createCategoryMutation,
    importCsvMutation,
    applyPresetsMutation,
  };
}
