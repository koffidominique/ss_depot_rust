import type { PackagingName, SalesUnitType } from "./auth.ts";

/* ============================================================================
 * Types métier : Catalogue produits V4, Brasseries, Unités & Conditionnements
 * ============================================================================ */

export interface Category {
  id: number;
  parent_id?: number | null;
  name: string;
  slug?: string | null;
  description: string | null;
  is_active: number;
}

export interface Brewery {
  id: number;
  code: string;
  name: string;
  short_name?: string | null;
  country_code?: string;
  country?: string | null;
  contact_info?: string | null;
  is_active: number;
}

export interface BrandRef {
  id: number;
  code: string;
  name: string;
  brewery_id: number | null;
  brewery_name?: string | null;
  manufacturer?: string | null;
  country_of_origin?: string | null;
  country?: string | null;
  description: string | null;
  is_active: number;
}

export interface ContainerTypeRef {
  id: number;
  code: string;
  name: string;
  material: string | null;
  default_volume_ml: number | null;
  volume_ml?: number | null;
  is_returnable: number;
  is_recyclable: number;
  default_deposit_value: number;
  default_deposit_amount?: number;
  is_active: number;
}

export interface PackagingTypeRef {
  id: number;
  code: string;
  name: string;
  default_name: PackagingName;
  default_capacity?: number | null;
  material?: string | null;
  is_reusable: number;
  is_returnable: number;
  default_deposit_amount?: number;
  is_active: number;
}

export interface StockLocationRef {
  id: number;
  code: string;
  name: string;
  location_type: string;
  is_default: number;
  is_active: number;
}

export interface DepositComponent {
  returnable_id: number;
  pieces_per_pack: number;
  code: string;
  name: string;
  deposit_value: number;
  kind: "bottle" | "crate";
  brand_name?: string | null;
  brand_id?: number | null;
}

export interface ProductPackaging {
  id: number;
  product_id: number;
  variant_id?: number | null;
  packaging_type_id?: number | null;
  name: PackagingName;
  display_label?: string | null;
  package_sku?: string | null;
  base_unit: string;
  coefficient_milli: number;
  purchase_price: number | null;
  wholesale_price: number | null;
  semi_wholesale_price: number | null;
  retail_price: number | null;
  min_selling_price?: number | null;
  barcode: string | null;
  allow_fraction: number;
  is_reusable?: number;
  is_returnable?: number;
  package_deposit_amount?: number;
  bottle_deposit_amount?: number;
  package_cost?: number;
  is_default_sale?: number;
  is_default_purchase?: number;
  is_active: number;
  deposit_mode: "none" | "deposit" | null;
  components: DepositComponent[];
}

export interface ProductVariantSummary {
  id: number;
  product_id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  volume_ml: number | null;
  container_type: string | null;
  container_type_id: number | null;
  compatibility_class?: string | null;
  native_crate_capacity?: number | null;
  container_material: string | null;
  container_returnable: number;
  container_recyclable: number;
  container_deposit_amount: number;
  is_active: number;
}

export interface ProductSalesUnit {
  id: number;
  product_id: number;
  variant_id: number | null;
  packaging_id: number | null;
  label: string;
  unit_type: SalesUnitType;
  conversion_factor: number;
  is_virtual: number;
  allow_fraction: number;
  purchase_price: number | null;
  wholesale_price: number | null;
  semi_wholesale_price: number | null;
  retail_price: number | null;
  min_selling_price: number | null;
  bottle_deposit_amount: number;
  crate_deposit_amount: number;
  barcode: string | null;
  is_default_sale: number;
  is_default_purchase: number;
  is_active: number;
}

export interface ProductSupplierLink {
  id: number;
  product_id: number;
  supplier_id: number;
  supplier_name: string;
  supplier_product_code: string | null;
  preferred_supplier: number;
  purchase_unit: string;
  units_per_purchase_package: number;
  last_purchase_price: number | null;
  is_active: number;
}

export interface DepositRuleRef {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  packaging_id: number | null;
  returnable_id: number;
  returnable_name: string;
  deposit_kind: "bottle" | "crate" | "pallet" | "other";
  amount: number;
  currency: string;
  effective_from: string;
  effective_to: string | null;
  supplier_id: number | null;
  is_active: number;
}

export interface Product {
  id: number;
  reference: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  brewery_id?: number | null;
  brewery_name?: string | null;
  brand_id?: number | null;
  variant_id?: number | null;
  variant_label?: string | null;
  category_id: number;
  category_name: string;
  subcategory_id?: number | null;
  subcategory_name?: string | null;
  supplier_id: number | null;
  supplier_name: string | null;
  description: string | null;
  alcohol_degree_milli?: number | null;
  is_alcoholic?: number;
  ingredients?: string | null;
  beverage_color?: string | null;
  storage_temp?: string | null;
  shelf_life_days?: number | null;
  is_perishable?: number;
  track_batches?: number;
  track_expiry?: number;
  allow_credit_sale?: number;
  allow_unit_sale?: number;
  allow_mixed_sale?: number;
  default_location_id?: number | null;
  status?: "draft" | "active" | "inactive" | string;
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
  variants?: ProductVariantSummary[];
  sales_units?: ProductSalesUnit[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CatalogPresetComponent {
  returnable_code: string;
  returnable_name: string;
  pieces_per_pack: number;
}

export interface CatalogPresetPackaging {
  name: string;
  coefficient: string;
  purchase_price: number;
  wholesale_price: number;
  semi_wholesale_price: number;
  retail_price: number;
  barcode: string | null;
  allow_fraction: boolean;
  deposit_mode: 'none' | 'deposit';
  components: CatalogPresetComponent[];
}

export interface CatalogPresetItem {
  key: string;
  brewery: 'SOLIBRA' | 'BRASSIVOIRE' | string;
  name: string;
  brand: string;
  barcode: string;
  category: string;
  base_unit: string;
  initial_stock: string;
  min_stock: string;
  purchase_price: number;
  wholesale_price: number;
  semi_wholesale_price: number;
  retail_price: number;
  description: string;
  packagings: CatalogPresetPackaging[];
  existing_product_id: number | null;
  existing_reference: string | null;
  existing_is_active: number | null;
}

export interface ApplyCatalogPresetsResult {
  created: number;
  reactivated: number;
  skipped: number;
  activate: boolean;
  products: Product[];
}

export interface DeleteProductResult {
  deleted: boolean;
  id: number;
  reference: string;
  name: string;
}
