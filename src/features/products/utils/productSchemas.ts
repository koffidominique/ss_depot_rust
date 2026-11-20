import { z } from 'zod';
import type { PackagingName, Product, ProductPackaging } from '../../../types/erp.ts';

export const qtyPattern = /^\d+(\.\d{1,3})?$/;

export const productSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du produit est obligatoire.'),
  brand: z.string().trim(),
  barcode: z.string().trim(),
  category_id: z.number().int().min(1, 'Catégorie obligatoire.'),
  base_unit: z.string().min(1),
  initial_stock: z
    .string()
    .trim()
    .refine((v) => v === '' || qtyPattern.test(v), 'Quantité invalide (3 décimales max).'),
  min_stock: z
    .string()
    .trim()
    .refine((v) => v === '' || qtyPattern.test(v), 'Seuil invalide (3 décimales max).'),
  purchase_price: z.number().int().min(0, 'Montant positif ou nul requis.'),
  wholesale_price: z.number().int().min(0, 'Montant positif ou nul requis.'),
  semi_wholesale_price: z.number().int().min(0, 'Montant positif ou nul requis.'),
  retail_price: z.number().int().min(0, 'Montant positif ou nul requis.'),
  image_path: z.string().nullable(),
});

export type ProductFormValues = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Le nom de la catégorie est obligatoire.'),
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
  barcode: string;
  allow_fraction: boolean;
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
    barcode: pk.barcode || '',
    allow_fraction: pk.allow_fraction === 1,
    is_active: pk.is_active === 1,
    deposit_mode: pk.deposit_mode === 'deposit' ? 'deposit' : 'none',
    returnable_id: firstComponent?.returnable_id ?? 0,
    returnable_pieces: firstComponent?.pieces_per_pack ?? 1,
    brand_name: firstComponent?.brand_name ?? pk.brand_name ?? '',
    brand_id: firstComponent?.brand_id ?? pk.brand_id ?? 0,
  };
}

export function buildNewPackagingState(prod: Product): PackagingFormState {
  const candidateNames: PackagingName[] = ['casier', 'pack', 'carton', 'bouteille', 'canette'];
  const nextName =
    candidateNames.find((n) => !prod.packagings.some((p) => p.name === n)) || 'casier';
  const defaultCoeff =
    nextName === 'casier' ? '24' : nextName === 'carton' ? '12' : nextName === 'pack' ? '6' : '1';
  return {
    id: undefined,
    name: nextName,
    coefficient: defaultCoeff,
    purchase_price: prod.purchase_price ?? 0,
    wholesale_price: 0,
    semi_wholesale_price: 0,
    retail_price: 0,
    barcode: '',
    allow_fraction: false,
    is_active: true,
    deposit_mode: 'none',
    returnable_id: 0,
    returnable_pieces: 1,
    brand_name: prod.brand ?? '',
    brand_id: 0,
  };
}
