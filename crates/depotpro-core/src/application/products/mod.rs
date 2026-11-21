// ============================================================================
// Catalogue produits & conditionnements : DTOs, inputs & sous-modules
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

mod create;
mod csv_io;
mod metadata;
mod packaging;
mod queries;
mod serde_helpers;
mod update;

pub use create::create_product;
pub use metadata::get_product_form_metadata;
pub use csv_io::{export_products_csv, import_products_csv};
pub use packaging::upsert_packaging;
pub(crate) use queries::get_product_by_id;
pub use queries::{create_category, list_active_products, list_categories, list_products};
pub(crate) use serde_helpers::{
    deserialize_nullable_opt, deserialize_opt_bool_or_int, deserialize_opt_qty_str,
    deserialize_qty_str, sanitize_image_path,
};
pub use update::update_product;

pub(crate) const ALLOWED_PACKAGING_NAMES: &[&str] = &["casier", "carton", "bouteille", "pack", "canette"];
pub(crate) const ALLOWED_CONTAINER_TYPES: &[&str] = &["glass_returnable", "glass_disposable", "pet", "can", "plastic_bottle", "other"];

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BreweryOptionDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub country_code: String,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BrandOptionDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub brewery_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct ProductFormMetadataDto {
    pub breweries: Vec<BreweryOptionDto>,
    pub brands: Vec<BrandOptionDto>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CategoryDto {
    pub id: i64,
    pub name: String,
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
    pub name: String,
    pub base_unit: String,
    pub coefficient_milli: i64,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub barcode: Option<String>,
    pub allow_fraction: i64,
    pub is_active: i64,
    pub deposit_mode: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProductPackagingDto {
    pub id: i64,
    pub product_id: i64,
    pub name: String,
    pub base_unit: String,
    pub coefficient_milli: i64,
    pub purchase_price: Option<i64>,
    pub wholesale_price: Option<i64>,
    pub semi_wholesale_price: Option<i64>,
    pub retail_price: Option<i64>,
    pub barcode: Option<String>,
    pub allow_fraction: i64,
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
    pub brand_id: Option<i64>,
    pub brewery_id: Option<i64>,
    pub brewery_name: Option<String>,
    pub variant_id: Option<i64>,
    pub variant_name: Option<String>,
    pub volume_ml: Option<i64>,
    pub container_type: Option<String>,
    pub alcohol_degree: Option<f64>,
    pub bottle_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub compatibility_group_id: Option<i64>,
    pub category_id: i64,
    pub category_name: String,
    pub supplier_id: Option<i64>,
    pub supplier_name: Option<String>,
    pub description: Option<String>,
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
    pub brand_id: Option<i64>,
    pub brewery_id: Option<i64>,
    pub brewery_name: Option<String>,
    pub variant_id: Option<i64>,
    pub variant_name: Option<String>,
    pub volume_ml: Option<i64>,
    pub container_type: Option<String>,
    pub alcohol_degree: Option<f64>,
    pub bottle_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub compatibility_group_id: Option<i64>,
    pub category_id: i64,
    pub category_name: String,
    pub supplier_id: Option<i64>,
    pub supplier_name: Option<String>,
    pub description: Option<String>,
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
    pub brand_id: Option<i64>,
    pub brewery_id: Option<i64>,
    pub variant_name: Option<String>,
    pub volume_ml: Option<i64>,
    pub container_type: Option<String>,
    pub alcohol_degree: Option<f64>,
    pub bottle_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub compatibility_group_id: Option<i64>,
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

#[derive(Debug, Deserialize)]
pub struct UpdateProductInput {
    pub name: Option<String>,
    pub brand: Option<String>,
    pub brand_id: Option<i64>,
    pub brewery_id: Option<i64>,
    pub variant_name: Option<String>,
    pub volume_ml: Option<i64>,
    pub container_type: Option<String>,
    pub alcohol_degree: Option<f64>,
    pub bottle_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub compatibility_group_id: Option<i64>,
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
