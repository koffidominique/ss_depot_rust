import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/createApiClient.ts';

export { useProductMutations } from './useProductMutations.ts';

export interface ProductFilters {
  search: string;
  categoryId?: number;
  includeArchived: boolean;
  lowStockOnly: boolean;
  page: number;
  pageSize?: number;
}

export function useProductsQueries(filters: ProductFilters, presetsOpen = false) {
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

  const packagingTypesQuery = useQuery({
    queryKey: ['packaging-types-v4'],
    queryFn: () => apiClient.listPackagingTypesV4(),
  });

  const stockLocationsQuery = useQuery({
    queryKey: ['stock-locations-v4'],
    queryFn: () => apiClient.listStockLocationsV4(),
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiClient.listSuppliers(),
  });

  const catalogPresetsQuery = useQuery({
    queryKey: ['catalog-presets'],
    queryFn: () => apiClient.listCatalogPresets(),
    enabled: presetsOpen,
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
    packagingTypesQuery,
    stockLocationsQuery,
    suppliersQuery,
    catalogPresetsQuery,
    productsQuery,
  };
}
