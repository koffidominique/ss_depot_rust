// ============================================================================
// DTOs de lecture et pagination du catalogue V3 / V4
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, FromRow)]
pub struct BrandDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub brewery_id: Option<i64>,
    pub country_of_origin: Option<String>,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ProductVariantDto {
    pub id: i64,
    pub product_id: i64,
    pub name: String,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub volume_ml: Option<i64>,
    pub container_type: Option<String>,
    pub container_type_id: Option<i64>,
    pub container_material: Option<String>,
    pub container_returnable: i64,
    pub container_recyclable: i64,
    pub container_deposit_amount: i64,
    pub native_crate_capacity: Option<i64>,
    pub compatibility_class: Option<String>,
    pub net_weight_g: Option<i64>,
    pub bottle_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub compatibility_group_id: Option<i64>,
    pub disposable_packaging_id: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct BottleProfileDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub producer: String,
    pub material: String,
    pub capacity_ml: i64,
    pub diameter_mm: Option<i64>,
    pub height_mm: Option<i64>,
    pub weight_g: Option<i64>,
    pub base_type: Option<String>,
    pub neck_type: Option<String>,
    pub compatibility_group_id: Option<i64>,
    pub deposit_value: i64,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CrateTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub producer: String,
    pub capacity: i64,
    pub bottle_capacity_ml: i64,
    pub bottle_profile_id: i64,
    pub compatibility_group_id: Option<i64>,
    pub dimensions: Option<String>,
    pub weight_g: Option<i64>,
    pub material: String,
    pub deposit_value: i64,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CompatibilityGroupDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub allows_mixed_brands: i64,
    pub allows_mixed_volumes: i64,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct DisposablePackagingTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub packaging_type: String,
    pub units_per_pack: i64,
    pub unit_volume_ml: i64,
    pub material: String,
    pub is_returnable: i64,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PackagingMaterialDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub category: String,
    pub is_recyclable: i64,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ContainerTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub material: String,
    pub is_returnable: i64,
    pub is_recyclable: i64,
    pub default_volume_ml: Option<i64>,
    pub default_deposit_value: i64,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct UnitOfMeasureDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub symbol: String,
    pub base_unit_id: Option<i64>,
    pub conversion_factor_num: i64,
    pub conversion_factor_den: i64,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SupplierProductPriceDto {
    pub id: i64,
    pub supplier_id: i64,
    pub product_id: i64,
    pub packaging_id: Option<i64>,
    pub purchase_price: i64,
    pub packaging_value: i64,
    pub fees: i64,
    pub valid_from: String,
    pub valid_to: Option<String>,
    pub source: String,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CustomerPriceListDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub currency: String,
    pub is_default: i64,
    pub valid_from: String,
    pub valid_to: Option<String>,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CustomerPriceListItemDto {
    pub id: i64,
    pub price_list_id: i64,
    pub product_id: i64,
    pub packaging_id: Option<i64>,
    pub price_tier: String,
    pub price: i64,
    pub packaging_value: i64,
    pub valid_from: String,
    pub valid_to: Option<String>,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PackagingValueDto {
    pub id: i64,
    pub returnable_id: i64,
    pub value_type: String,
    pub amount: i64,
    pub currency: String,
    pub valid_from: String,
    pub valid_to: Option<String>,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PriceHistoryDto {
    pub id: i64,
    pub entity_type: String,
    pub entity_id: i64,
    pub variant_id: Option<i64>,
    pub sales_unit_id: Option<i64>,
    pub supplier_id: Option<i64>,
    pub price_type: Option<String>,
    pub old_price: Option<i64>,
    pub new_price: Option<i64>,
    pub old_packaging_value: Option<i64>,
    pub new_packaging_value: Option<i64>,
    pub currency: String,
    pub effective_from: Option<String>,
    pub effective_to: Option<String>,
    pub changed_by: Option<i64>,
    pub reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedQuery {
    #[serde(default = "default_page")]
    pub page: i64,
    #[serde(default = "default_page_size")]
    pub page_size: i64,
    pub search: Option<String>,
    pub include_archived: Option<bool>,
}

fn default_page() -> i64 {
    1
}
fn default_page_size() -> i64 {
    50
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResponse<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}
