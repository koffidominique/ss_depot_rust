import { z } from 'zod';
import type { PackagingName, Product, ProductPackaging } from '../../../types/erp.ts';

export const qtyPattern = /^\d+(\.\d{1,3})?$/;

export const PACKAGING_OPTIONS: PackagingName[] = [
  'casier',
  'carton',
  'bouteille',
  'pack',
  'canette',
];

export const salesUnitDraftSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis.'),
  unit_type: z.enum([
    'bottle',
    'can',
    'pack',
    'carton',
    'half_crate',
    'crate',
    'film',
    'pallet',
    'custom',
  ]),
  conversion_factor: z.number().int().min(1, 'Facteur >= 1.'),
  is_virtual: z.boolean(),
  allow_fraction: z.boolean(),
  retail_price: z.number().int().min(0).nullable(),
  wholesale_price: z.number().int().min(0).nullable(),
  semi_wholesale_price: z.number().int().min(0).nullable(),
  min_selling_price: z.number().int().min(0).nullable(),
  is_default_sale: z.boolean(),
});

export type SalesUnitDraft = z.infer<typeof salesUnitDraftSchema>;

export const productSchema = z.object({
  // Étape 1 — Identité
  name: z.string().trim().min(1, 'Le nom du produit est obligatoire.'),
  sku: z.string().trim(),
  brewery_id: z.number().int().nullable(),
  brand_id: z.number().int().nullable(),
  brand: z.string().trim(),
  category_id: z.number().int().min(1, 'Catégorie obligatoire.'),
  subcategory_id: z.number().int().nullable(),
  variant_label: z.string().trim(),
  barcode: z.string().trim(),
  description: z.string().trim(),
  image_path: z.string().nullable(),
  // Étape 2 — Caractéristiques boisson & contenant
  volume_ml: z.number().int().min(0).nullable(),
  container_type_id: z.number().int().nullable(),
  container_type: z.string().trim(),
  container_material: z.string().trim(),
  container_returnable: z.boolean(),
  container_recyclable: z.boolean(),
  container_deposit_amount: z.number().int().min(0),
  is_alcoholic: z.boolean(),
  alcohol_degree_str: z.string().trim(),
  ingredients: z.string().trim(),
  beverage_color: z.string().trim(),
  storage_temp: z.string().trim(),
  shelf_life_days: z.number().int().min(0).nullable(),
  is_perishable: z.boolean(),
  // Étape 3 — Emballage commercial
  base_unit: z.string().min(1),
  packaging_type_id: z.number().int().nullable(),
  packaging_name: z.enum(['casier', 'carton', 'bouteille', 'pack', 'canette']),
  packaging_coeff: z
    .string()
    .trim()
    .refine((v) => v === '' || qtyPattern.test(v), 'Coefficient invalide.'),
  package_sku: z.string().trim(),
  package_reusable: z.boolean(),
  package_returnable: z.boolean(),
  package_cost: z.number().int().min(0),
  // Étape 4 — Unités de vente configurables
  sales_units: z.array(salesUnitDraftSchema),
  // Étape 5 — Tarifs & consignes
  purchase_price: z.number().int().min(0, 'Montant positif ou nul requis.'),
  wholesale_price: z.number().int().min(0),
  semi_wholesale_price: z.number().int().min(0),
  retail_price: z.number().int().min(0, 'Montant positif ou nul requis.'),
  min_selling_price: z.number().int().min(0),
  package_deposit_amount: z.number().int().min(0),
  bottle_deposit_amount: z.number().int().min(0),
  allow_unit_sale: z.boolean(),
  allow_mixed_sale: z.boolean(),
  allow_credit_sale: z.boolean(),
  unit_retail_price: z.number().int().min(0),
  // Étape 6 — Stock, traçabilité & fournisseur principal
  initial_stock: z
    .string()
    .trim()
    .refine((v) => v === '' || qtyPattern.test(v), 'Quantité invalide (3 décimales max).'),
  min_stock: z
    .string()
    .trim()
    .refine((v) => v === '' || qtyPattern.test(v), 'Seuil invalide (3 décimales max).'),
  max_stock: z
    .string()
    .trim()
    .refine((v) => v === '' || qtyPattern.test(v), 'Stock max invalide.'),
  default_location_id: z.number().int().nullable(),
  track_batches: z.boolean(),
  track_expiry: z.boolean(),
  status: z.enum(['active', 'draft', 'inactive']),
  supplier_id: z.number().int().nullable(),
  supplier_product_code: z.string().trim(),
  purchase_unit: z.string().trim(),
  units_per_purchase_package: z.number().int().min(1),
});

export type ProductFormValues = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Le nom de la catégorie est obligatoire.'),
  parent_id: z.number().int().nullable().optional(),
  description: z.string().trim(),
});

export type CategoryFormValues = z.infer<typeof categorySchema>;

export interface PackagingFormState {
  id?: number;
  name: PackagingName;
  coefficient: string;
  purchase_price: number;
  wholesale_price: number;
  semi_wholesale_price: number;
  retail_price: number;
  min_selling_price: number;
  package_deposit_amount: number;
  bottle_deposit_amount: number;
  barcode: string;
  allow_fraction: boolean;
  is_reusable: boolean;
  is_returnable: boolean;
  is_default_sale: boolean;
  is_default_purchase: boolean;
  is_active: boolean;
  deposit_mode: 'none' | 'deposit';
  returnable_id: number;
  returnable_pieces: number;
  brand_name: string;
  brand_id: number;
}

export function formatCoeffDot(milli: number): string {
  const intPart = Math.floor(milli / 1000);
  const fracPart = milli % 1000;
  if (fracPart === 0) return String(intPart);
  return `${intPart}.${String(fracPart).padStart(3, '0').replace(/0+$/, '')}`;
}

export function buildPackagingStateFromExisting(pk: ProductPackaging): PackagingFormState {
  const firstComponent = pk.components?.[0];
  return {
    id: pk.id,
    name: pk.name,
    coefficient: formatCoeffDot(pk.coefficient_milli),
    purchase_price: pk.purchase_price ?? 0,
    wholesale_price: pk.wholesale_price ?? 0,
    semi_wholesale_price: pk.semi_wholesale_price ?? 0,
    retail_price: pk.retail_price ?? 0,
    min_selling_price: pk.min_selling_price ?? 0,
    package_deposit_amount: pk.package_deposit_amount ?? 0,
    bottle_deposit_amount: pk.bottle_deposit_amount ?? 0,
    barcode: pk.barcode || '',
    allow_fraction: pk.allow_fraction === 1,
    is_reusable: pk.is_reusable === 1,
    is_returnable: pk.is_returnable === 1,
    is_default_sale: pk.is_default_sale === 1,
    is_default_purchase: pk.is_default_purchase === 1,
    is_active: pk.is_active === 1,
    deposit_mode: pk.deposit_mode === 'deposit' ? 'deposit' : 'none',
    returnable_id: firstComponent?.returnable_id ?? 0,
    returnable_pieces: firstComponent?.pieces_per_pack ?? 1,
    brand_name: firstComponent?.brand_name ?? '',
    brand_id: firstComponent?.brand_id ?? 0,
  };
}

export function buildNewPackagingState(prod: Product): PackagingFormState {
  const usedNames = new Set(prod.packagings.map((p) => p.name));
  const nextName = PACKAGING_OPTIONS.find((opt) => !usedNames.has(opt)) ?? 'bouteille';
  const defaultCoeff =
    nextName === 'casier' || nextName === 'carton' ? '24' : nextName === 'pack' ? '6' : '1';
  return {
    id: undefined,
    name: nextName,
    coefficient: defaultCoeff,
    purchase_price: prod.purchase_price ?? 0,
    wholesale_price: prod.wholesale_price ?? 0,
    semi_wholesale_price: prod.semi_wholesale_price ?? 0,
    retail_price: 0,
    min_selling_price: 0,
    package_deposit_amount: 0,
    bottle_deposit_amount: 0,
    barcode: '',
    allow_fraction: nextName === 'casier',
    is_reusable: nextName === 'casier' || nextName === 'bouteille',
    is_returnable: nextName === 'casier' || nextName === 'bouteille',
    is_default_sale: false,
    is_default_purchase: false,
    is_active: true,
    deposit_mode: 'none',
    returnable_id: 0,
    returnable_pieces: 1,
    brand_name: prod.brand ?? '',
    brand_id: prod.brand_id ?? 0,
  };
}

export function normalizeProductName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
