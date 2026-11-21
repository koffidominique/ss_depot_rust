import { apiClient } from '../../../services/api/createApiClient.ts';
import type { Category, Product } from '../../../types/erp.ts';
import { compressLocalImage } from '../../../utils/image.ts';
import type { PackagingFormState, ProductFormValues } from './productSchemas.ts';

/* ============================================================================
 * Helpers de la page Produits (valeurs par défaut, CSV & compression photo)
 * ============================================================================ */

export const INITIAL_PACKAGING_STATE: PackagingFormState = {
  id: undefined,
  name: 'casier',
  coefficient: '24',
  purchase_price: 0,
  wholesale_price: 0,
  semi_wholesale_price: 0,
  retail_price: 0,
  min_selling_price: 0,
  package_deposit_amount: 0,
  bottle_deposit_amount: 0,
  barcode: '',
  allow_fraction: false,
  is_reusable: false,
  is_returnable: false,
  is_default_sale: false,
  is_default_purchase: false,
  is_active: true,
  deposit_mode: 'none',
  returnable_id: 0,
  returnable_pieces: 1,
  brand_name: '',
  brand_id: 0,
};

export function createProductDefaultValues(categories?: Category[]): ProductFormValues {
  const firstRootCat = categories?.find((c) => !c.parent_id) ?? categories?.[0];
  return {
    name: '',
    sku: '',
    brewery_id: null,
    brand_id: null,
    brand: '',
    category_id: firstRootCat?.id ?? 1,
    subcategory_id: null,
    variant_label: '',
    barcode: '',
    description: '',
    image_path: null,
    volume_ml: 500,
    container_type_id: null,
    container_type: 'glass_returnable',
    container_material: 'glass',
    container_returnable: false,
    container_recyclable: true,
    container_deposit_amount: 0,
    is_alcoholic: false,
    alcohol_degree_str: '',
    ingredients: '',
    beverage_color: '',
    storage_temp: 'Ambiante',
    shelf_life_days: null,
    is_perishable: false,
    base_unit: 'bouteille',
    packaging_name: 'casier',
    packaging_coeff: '1',
    purchase_price: 0,
    wholesale_price: 0,
    semi_wholesale_price: 0,
    retail_price: 0,
    min_selling_price: 0,
    package_deposit_amount: 0,
    bottle_deposit_amount: 0,
    allow_unit_sale: true,
    allow_mixed_sale: true,
    allow_credit_sale: true,
    unit_retail_price: 0,
    initial_stock: '0',
    min_stock: '24',
    max_stock: '0',
    default_location_id: null,
    track_batches: false,
    track_expiry: false,
    status: 'active',
    supplier_id: null,
    supplier_product_code: '',
    purchase_unit: 'casier',
    units_per_purchase_package: 24,
  };
}

export function editProductDefaultValues(prod: Product): ProductFormValues {
  const firstVariant = prod.variants?.[0];
  const firstPkg = prod.packagings?.[0];
  return {
    name: prod.name,
    sku: prod.reference,
    brewery_id: prod.brewery_id ?? null,
    brand_id: prod.brand_id ?? null,
    brand: prod.brand || '',
    category_id: prod.category_id,
    subcategory_id: prod.subcategory_id ?? null,
    variant_label: prod.variant_label || '',
    barcode: prod.barcode || '',
    description: prod.description || '',
    image_path: prod.image_path ?? null,
    volume_ml: firstVariant?.volume_ml ?? 500,
    container_type_id: firstVariant?.container_type_id ?? null,
    container_type: firstVariant?.container_type ?? 'glass_returnable',
    container_material: firstVariant?.container_material ?? 'glass',
    container_returnable: firstVariant?.container_returnable === 1,
    container_recyclable: firstVariant?.container_recyclable !== 0,
    container_deposit_amount: firstVariant?.container_deposit_amount ?? 0,
    is_alcoholic: prod.is_alcoholic === 1,
    alcohol_degree_str:
      prod.alcohol_degree_milli != null ? String(prod.alcohol_degree_milli / 1000) : '',
    ingredients: prod.ingredients || '',
    beverage_color: prod.beverage_color || '',
    storage_temp: prod.storage_temp || 'Ambiante',
    shelf_life_days: prod.shelf_life_days ?? null,
    is_perishable: prod.is_perishable === 1,
    base_unit: prod.base_unit,
    packaging_name: firstPkg?.name ?? 'casier',
    packaging_coeff: firstPkg ? String(firstPkg.coefficient_milli / 1000) : '1',
    purchase_price: prod.purchase_price ?? 0,
    wholesale_price: prod.wholesale_price ?? 0,
    semi_wholesale_price: prod.semi_wholesale_price ?? 0,
    retail_price: prod.retail_price ?? 0,
    min_selling_price: firstPkg?.min_selling_price ?? 0,
    package_deposit_amount: firstPkg?.package_deposit_amount ?? 0,
    bottle_deposit_amount: firstPkg?.bottle_deposit_amount ?? 0,
    allow_unit_sale: prod.allow_unit_sale !== 0,
    allow_mixed_sale: prod.allow_mixed_sale !== 0,
    allow_credit_sale: prod.allow_credit_sale !== 0,
    unit_retail_price: 0,
    initial_stock: '0',
    min_stock: String(prod.min_stock_milli / 1000),
    max_stock: String((prod.max_stock_milli ?? 0) / 1000),
    default_location_id: prod.default_location_id ?? null,
    track_batches: prod.track_batches === 1,
    track_expiry: prod.track_expiry === 1,
    status: (prod.status === 'draft' || prod.status === 'inactive'
      ? prod.status
      : 'active') as 'active' | 'draft' | 'inactive',
    supplier_id: prod.supplier_id ?? null,
    supplier_product_code: '',
    purchase_unit: 'casier',
    units_per_purchase_package: 24,
  };
}

export async function compressProductImageFile(file: File): Promise<string> {
  return compressLocalImage(file, {
    maxSide: 256,
    quality: 0.82,
    maxLength: 350_000,
  });
}

export async function downloadProductsCsvFile(): Promise<void> {
  const csv = await apiClient.exportProductsCsv();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'depotpro_produits.csv';
  a.click();
  URL.revokeObjectURL(url);
}
