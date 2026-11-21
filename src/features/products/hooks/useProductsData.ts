import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';
import type { Category, Product } from '../../../types/erp.ts';
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
}

export function useProductsQueries(filters: ProductFilters) {
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.listCategories(),
  });

  const consignmentsQuery = useQuery({
    queryKey: ['consignments'],
    queryFn: () => apiClient.getConsignmentsOverview(),
  });

  const breweriesQuery = useQuery({
    queryKey: ['breweries'],
    queryFn: () => apiClient.listBreweries(),
  });

  const brandsQuery = useQuery({
    queryKey: ['brands-v4'],
    queryFn: () => apiClient.listBrandsV4(),
  });

  const containerTypesQuery = useQuery({
    queryKey: ['container-types-v4'],
    queryFn: () => apiClient.listContainerTypesV4(),
  });

  const stockLocationsQuery = useQuery({
    queryKey: ['stock-locations-v4'],
    queryFn: () => apiClient.listStockLocationsV4(),
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiClient.listSuppliers(),
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
    consignmentsQuery,
    breweriesQuery,
    brandsQuery,
    containerTypesQuery,
    stockLocationsQuery,
    suppliersQuery,
    productsQuery,
  };
}

function parseAlcoholMilli(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 1000) : null;
}

export function useProductMutations(callbacks: {
  onSavedProduct: () => void;
  onSavedPackaging: (isUpdate: boolean) => void;
  onArchivedProduct: () => void;
  onCreatedCategory: (cat: Category) => void;
  onImportedCsv: (createdCount: number) => void;
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
      const commonV4 = {
        brewery_id: values.brewery_id,
        brand_id: values.brand_id,
        subcategory_id: values.subcategory_id,
        variant_label: values.variant_label.trim() || null,
        alcohol_degree_milli: values.is_alcoholic ? parseAlcoholMilli(values.alcohol_degree_str) : null,
        is_alcoholic: values.is_alcoholic,
        ingredients: values.ingredients.trim() || null,
        beverage_color: values.beverage_color.trim() || null,
        storage_temp: values.storage_temp.trim() || null,
        shelf_life_days: values.is_perishable ? values.shelf_life_days : null,
        is_perishable: values.is_perishable,
        track_batches: values.track_batches,
        track_expiry: values.track_expiry,
        allow_credit_sale: values.allow_credit_sale,
        allow_unit_sale: values.allow_unit_sale,
        allow_mixed_sale: values.allow_mixed_sale,
        default_location_id: values.default_location_id,
        status: values.status,
      };

      if (editingProduct) {
        return apiClient.updateProduct(editingProduct.id, {
          name: values.name.trim(),
          brand: values.brand.trim(),
          barcode: values.barcode.trim() || null,
          category_id: values.category_id,
          supplier_id: values.supplier_id,
          description: values.description.trim() || null,
          min_stock: values.min_stock || '0',
          max_stock: values.max_stock || '0',
          purchase_price: values.purchase_price,
          wholesale_price: values.wholesale_price,
          semi_wholesale_price: values.semi_wholesale_price,
          retail_price: values.retail_price,
          image_path: values.image_path,
          ...commonV4,
        });
      }

      return apiClient.createProduct({
        name: values.name.trim(),
        sku: values.sku.trim() || null,
        brand: values.brand.trim(),
        barcode: values.barcode.trim() || null,
        category_id: values.category_id,
        supplier_id: values.supplier_id,
        description: values.description.trim() || null,
        base_unit: values.base_unit,
        initial_stock: values.initial_stock || '0',
        min_stock: values.min_stock || '0',
        max_stock: values.max_stock || '0',
        purchase_price: values.purchase_price,
        wholesale_price: values.wholesale_price,
        semi_wholesale_price: values.semi_wholesale_price,
        retail_price: values.retail_price,
        image_path: values.image_path,
        ...commonV4,
        variant:
          values.volume_ml && values.volume_ml > 0
            ? {
                name: `${values.name.trim()} ${values.volume_ml}ml`,
                container_type_id: values.container_type_id,
                container_type: values.container_type || null,
                volume_ml: values.volume_ml,
                container_material: values.container_material || null,
                container_returnable: values.container_returnable,
                container_recyclable: values.container_recyclable,
                container_deposit_amount: values.container_deposit_amount,
              }
            : null,
        packagings: [
          {
            name: values.packaging_name,
            coefficient: values.packaging_coeff || '1',
            purchase_price: values.purchase_price,
            wholesale_price: values.wholesale_price || null,
            semi_wholesale_price: values.semi_wholesale_price || null,
            retail_price: values.retail_price,
            allow_fraction: values.allow_mixed_sale && values.packaging_name === 'casier',
            is_active: true,
            deposit_mode: 'none',
            components: [],
          },
        ],
        packaging_extras: [
          {
            min_selling_price: values.min_selling_price || null,
            package_deposit_amount: values.package_deposit_amount,
            bottle_deposit_amount: values.bottle_deposit_amount,
            is_reusable: values.container_returnable,
            is_returnable: values.container_returnable,
            is_default_sale: true,
            is_default_purchase: true,
          },
        ],
        product_suppliers: values.supplier_id
          ? [
              {
                supplier_id: values.supplier_id,
                supplier_product_code: values.supplier_product_code.trim() || null,
                preferred_supplier: true,
                purchase_unit: values.purchase_unit || 'casier',
                units_per_purchase_package: values.units_per_purchase_package || 1,
                last_purchase_price: values.purchase_price || null,
              },
            ]
          : [],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
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
      callbacks.onArchivedProduct();
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
        wholesale_price: pkg.wholesale_price || null,
        semi_wholesale_price: pkg.semi_wholesale_price || null,
        retail_price: pkg.retail_price,
        min_selling_price: pkg.min_selling_price || null,
        package_deposit_amount: pkg.package_deposit_amount,
        bottle_deposit_amount: pkg.bottle_deposit_amount,
        barcode: pkg.barcode || null,
        allow_fraction: pkg.allow_fraction,
        is_reusable: pkg.is_reusable,
        is_returnable: pkg.is_returnable,
        is_default_sale: pkg.is_default_sale,
        is_default_purchase: pkg.is_default_purchase,
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
      apiClient.createCategory(
        vals.name.trim(),
        vals.description.trim() || undefined,
        vals.parent_id ?? null,
      ),
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

  return {
    saveProductMutation,
    archiveMutation,
    upsertPkgMutation,
    createCategoryMutation,
    importCsvMutation,
  };
}
