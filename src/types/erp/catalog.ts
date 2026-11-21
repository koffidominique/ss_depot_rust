import type { PackagingName } from "./auth.ts";

/* ============================================================================
 * Types métier : Catalogue produits, Conditionnements & Pagination
 * ============================================================================ */

export interface Category {
  id: number;
  name: string;
  description: string | null;
  is_active: number;
}

export interface DepositComponent {
  returnable_id: number;
  pieces_per_pack: number;
  code: string;
  name: string;
  deposit_value: number;
  kind: "bottle" | "crate";
  brand_name: string | null;
  brand_id: number | null;
}

export interface ProductPackaging {
  id: number;
  product_id: number;
  name: PackagingName;
  base_unit: string;
  coefficient_milli: number;
  purchase_price: number | null;
  wholesale_price: number | null;
  semi_wholesale_price: number | null;
  retail_price: number | null;
  barcode: string | null;
  allow_fraction: number;
  is_active: number;
  deposit_mode: "none" | "deposit" | null;
  components: DepositComponent[];
}

export interface BreweryOption {
  id: number;
  code: string;
  name: string;
  countryCode: string;
}

export interface BrandOption {
  id: number;
  code: string;
  name: string;
  breweryId: number | null;
}

export interface ProductFormMetadata {
  breweries: BreweryOption[];
  brands: BrandOption[];
}

export interface Product {
  id: number;
  reference: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  brand_id: number | null;
  brewery_id: number | null;
  brewery_name: string | null;
  variant_id: number | null;
  variant_name: string | null;
  volume_ml: number | null;
  container_type: 'glass_returnable' | 'glass_disposable' | 'pet' | 'can' | 'plastic_bottle' | 'other' | null;
  alcohol_degree: number | null;
  bottle_profile_id: number | null;
  crate_type_id: number | null;
  compatibility_group_id: number | null;
  category_id: number;
  category_name: string;
  supplier_id: number | null;
  supplier_name: string | null;
  description: string | null;
  base_unit: string;
  stock_milli: number;
  min_stock_milli: number;
  max_stock_milli: number;
  average_cost_fcfa: number | null;
  purchase_price: number | null;
  wholesale_price: number | null;
  semi_wholesale_price: number | null;
  retail_price: number | null;
  image_path: string | null;
  is_active: number;
  packagings: ProductPackaging[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
