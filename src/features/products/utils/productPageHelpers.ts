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

export function createProductDefaultValues(categories?: Category[]): ProductFormValues {
  return {
    name: '',
    brand: '',
    barcode: '',
    category_id: categories?.[0]?.id ?? 1,
    base_unit: 'bouteille',
    initial_stock: '0',
    min_stock: '24',
    purchase_price: 0,
    retail_price: 0,
    image_path: null,
  };
}

export function editProductDefaultValues(prod: Product): ProductFormValues {
  return {
    name: prod.name,
    brand: prod.brand || '',
    barcode: prod.barcode || '',
    category_id: prod.category_id,
    base_unit: prod.base_unit,
    initial_stock: '0',
    min_stock: String(prod.min_stock_milli / 1000),
    purchase_price: prod.purchase_price ?? 0,
    retail_price: prod.retail_price ?? 0,
    image_path: prod.image_path ?? null,
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
