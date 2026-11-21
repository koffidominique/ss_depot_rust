// ============================================================================
// Catalogue produits & conditionnements : DTOs, inputs & sous-modules
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

mod categories;
mod create;
mod create_packagings;
mod create_prep_helpers;
mod create_units_helpers;
pub(crate) mod create_v4_helpers;
mod csv_io;
mod delete;
mod duplicate;
mod hydrate;
mod packaging;
mod packaging_deposit;
mod presets;
mod presets_helpers;
mod presets_types;
mod queries;
mod serde_helpers;
mod update;
pub mod v4_types;

pub use categories::{
    create_category, create_category_with_parent, list_categories, update_category,
};
pub use create::{create_product, create_product_v4};
pub use csv_io::{export_products_csv, import_products_csv};
pub use delete::{delete_product, DeleteProductResultDto};
pub use duplicate::normalize_product_name;
pub use packaging::{upsert_packaging, upsert_packaging_v4};
pub use presets::{apply_catalog_presets, list_catalog_presets};
pub use presets_types::{
    ApplyCatalogPresetsInput, ApplyCatalogPresetsResultDto, CatalogPresetComponentDto,
    CatalogPresetItemDto, CatalogPresetListDto, CatalogPresetPackagingDto,
};
pub use queries::{
    delete_or_archive_product, get_product_by_id, list_active_products, list_products,
};
pub(crate) use serde_helpers::{
    deserialize_nullable_opt, deserialize_opt_bool_or_int, deserialize_opt_qty_str,
    deserialize_qty_str, sanitize_image_path,
};
pub use update::{update_product, update_product_v4};
pub use v4_types::{
    InitialProductSupplierInput, InitialSalesUnitInput, InitialVariantInput, PackagingV4Extras,
    ProductSalesUnitDto, ProductV4CreateExtras, ProductV4UpdateExtras, ProductVariantSummaryDto,
};

pub(crate) const ALLOWED_PACKAGING_NAMES: &[&str] =
    &["casier", "carton", "bouteille", "pack", "canette"];

#[derive(Debug, Serialize, FromRow)]
pub struct CategoryDto {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub is_active: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct DepositComponentDto {
    pub returnable_id: i64,
    pub pieces_per_pack: i64,
    pub code: String,
    pub name: String,
    pub deposit_value: i64,
    pub kind: String,
}

#[derive(Debug, Serialize, FromRow)]
pub(crate) struct PackagingRow {
    pub id: i64,
    pub product_id: i64,
    pub variant_id: Option<i64>,
    pub packaging_type_id: Option<i64>,
    pub name: String,
    pub display_label: Option<String>,
    pub package_sku: Option<String>,
    pub base_unit: String,
    pub coefficient_milli: i64,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub min_selling_price: Option<i64>,
    pub barcode: Option<String>,
    pub allow_fraction: i64,
    pub is_reusable: i64,
    pub is_returnable: i64,
    pub package_deposit_amount: i64,
    pub bottle_deposit_amount: i64,
    pub package_cost: i64,
    pub is_default_sale: i64,
    pub is_default_purchase: i64,
    pub is_active: i64,
    pub deposit_mode: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProductPackagingDto {
    pub id: i64,
    pub product_id: i64,
    pub variant_id: Option<i64>,
    pub packaging_type_id: Option<i64>,
    pub name: String,
    pub display_label: Option<String>,
    pub package_sku: Option<String>,
    pub base_unit: String,
    pub coefficient_milli: i64,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub min_selling_price: Option<i64>,
    pub barcode: Option<String>,
    pub allow_fraction: i64,
    pub is_reusable: i64,
    pub is_returnable: i64,
    pub package_deposit_amount: i64,
    pub bottle_deposit_amount: i64,
    pub package_cost: i64,
    pub is_default_sale: i64,
    pub is_default_purchase: i64,
    pub is_active: i64,
    pub deposit_mode: Option<String>,
    pub components: Vec<DepositComponentDto>,
}

#[derive(Debug, Serialize, FromRow)]
pub(crate) struct ProductRow {
    pub id: i64,
    pub reference: String,
    pub barcode: Option<String>,
    pub name: String,
    pub brand: Option<String>,
    pub brewery_id: Option<i64>,
    pub brewery_name: Option<String>,
    pub brand_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub variant_label: Option<String>,
    pub category_id: i64,
    pub category_name: String,
    pub subcategory_id: Option<i64>,
    pub subcategory_name: Option<String>,
    pub supplier_id: Option<i64>,
    pub supplier_name: Option<String>,
    pub description: Option<String>,
    pub alcohol_degree_milli: Option<i64>,
    pub is_alcoholic: i64,
    pub ingredients: Option<String>,
    pub beverage_color: Option<String>,
    pub storage_temp: Option<String>,
    pub shelf_life_days: Option<i64>,
    pub is_perishable: i64,
    pub track_batches: i64,
    pub track_expiry: i64,
    pub allow_credit_sale: i64,
    pub allow_unit_sale: i64,
    pub allow_mixed_sale: i64,
    pub default_location_id: Option<i64>,
    pub status: String,
    pub base_unit: String,
    pub stock_milli: i64,
    pub min_stock_milli: i64,
    pub max_stock_milli: i64,
    pub average_cost_num: Option<String>,
    pub average_cost_den: Option<String>,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub image_path: Option<String>,
    pub is_active: i64,
}

#[derive(Debug, Serialize)]
pub struct ProductSummaryDto {
    pub id: i64,
    pub reference: String,
    pub barcode: Option<String>,
    pub name: String,
    pub brand: Option<String>,
    pub brewery_id: Option<i64>,
    pub brewery_name: Option<String>,
    pub brand_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub variant_label: Option<String>,
    pub category_id: i64,
    pub category_name: String,
    pub subcategory_id: Option<i64>,
    pub subcategory_name: Option<String>,
    pub supplier_id: Option<i64>,
    pub supplier_name: Option<String>,
    pub description: Option<String>,
    pub alcohol_degree_milli: Option<i64>,
    pub is_alcoholic: i64,
    pub ingredients: Option<String>,
    pub beverage_color: Option<String>,
    pub storage_temp: Option<String>,
    pub shelf_life_days: Option<i64>,
    pub is_perishable: i64,
    pub track_batches: i64,
    pub track_expiry: i64,
    pub allow_credit_sale: i64,
    pub allow_unit_sale: i64,
    pub allow_mixed_sale: i64,
    pub default_location_id: Option<i64>,
    pub status: String,
    pub base_unit: String,
    pub stock_milli: i64,
    pub min_stock_milli: i64,
    pub max_stock_milli: i64,
    pub average_cost_fcfa: Option<i64>,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub image_path: Option<String>,
    pub is_active: i64,
    pub packagings: Vec<ProductPackagingDto>,
    pub variants: Vec<v4_types::ProductVariantSummaryDto>,
    pub sales_units: Vec<ProductSalesUnitDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedProductsDto {
    pub items: Vec<ProductSummaryDto>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}

#[derive(Debug, Deserialize)]
pub struct DepositComponentInput {
    pub returnable_id: i64,
    pub pieces_per_pack: i64,
}

#[derive(Debug, Deserialize)]
pub struct PackagingInput {
    pub id: Option<i64>,
    pub name: String,
    #[serde(deserialize_with = "deserialize_qty_str")]
    pub coefficient: String,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub barcode: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allow_fraction: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
    pub deposit_mode: Option<String>,
    pub components: Option<Vec<DepositComponentInput>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateProductInput {
    pub name: String,
    pub brand: Option<String>,
    pub barcode: Option<String>,
    pub category_id: i64,
    pub supplier_id: Option<i64>,
    pub description: Option<String>,
    pub base_unit: String,
    #[serde(default, deserialize_with = "deserialize_opt_qty_str")]
    pub initial_stock: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_qty_str")]
    pub min_stock: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_qty_str")]
    pub max_stock: Option<String>,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub image_path: Option<String>,
    pub packagings: Option<Vec<PackagingInput>>,
}

#[derive(Debug, Default, Deserialize)]
pub struct UpdateProductInput {
    pub name: Option<String>,
    pub brand: Option<String>,
    pub barcode: Option<String>,
    pub category_id: Option<i64>,
    pub supplier_id: Option<i64>,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_qty_str")]
    pub min_stock: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_qty_str")]
    pub max_stock: Option<String>,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_nullable_opt")]
    pub image_path: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}
