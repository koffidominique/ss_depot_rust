import { apiClient } from '../../../services/api/createApiClient.ts';
import type { Category, Product, ProductFormMetadata } from '../../../types/erp.ts';
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

export function createProductDefaultValues(
  categories?: Category[],
  metadata?: ProductFormMetadata,
): ProductFormValues {
  // Ne jamais présélectionner une marque : éviter d'enregistrer une boisson
  // sous SOLIBRA ou BRASSIVOIRE par défaut alors que l'opérateur n'a rien choisi.
  void metadata;
  return {
    name: '',
    brand: '',
    brand_id: 0,
    brewery_id: 0,
    variant_name: '',
    volume_ml: 330,
    container_type: 'glass_returnable',
    alcohol_degree: 0,
    packaging_type: 'casier',
    units_per_package: 24,
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

export function editProductDefaultValues(prod: Product, metadata?: ProductFormMetadata): ProductFormValues {
  const brand = metadata?.brands.find((item) => item.id === prod.brand_id)
    ?? metadata?.brands.find((item) => item.name.toLowerCase() === (prod.brand ?? '').toLowerCase());
  const firstPackaging = prod.packagings[0];
  return {
    name: prod.name,
    brand: brand?.name ?? prod.brand ?? '',
    brand_id: prod.brand_id ?? brand?.id ?? 0,
    brewery_id: prod.brewery_id ?? brand?.breweryId ?? 0,
    variant_name: prod.variant_name ?? prod.name,
    // Ne pas inventer un format physique sur une ancienne fiche non renseignée.
    // L'opérateur devra saisir le volume réel avant d'enregistrer cette modification.
    volume_ml: prod.volume_ml ?? 0,
    container_type: prod.container_type ?? 'other',
    alcohol_degree: prod.alcohol_degree ?? 0,
    packaging_type: (firstPackaging?.name === 'carton' || firstPackaging?.name === 'pack' ? firstPackaging.name : 'casier'),
    units_per_package: Math.max(1, Math.round((firstPackaging?.coefficient_milli ?? 24000) / 1000)),
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
