// ============================================================================
// DTOs de lecture et pagination du catalogue V3
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, FromRow)]
pub struct BrandDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub brewery_id: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ProductVariantDto {
    pub id: i64,
    pub product_id: i64,
    pub name: String,
    pub reference: Option<String>,
    pub barcode: Option<String>,
    pub volume_ml: Option<i64>,
    pub container_type: Option<String>,
    pub alcohol_degree: Option<f64>,
    pub bottle_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub compatibility_group_id: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct BottleProfileDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub volume_ml: i64,
    pub diameter_mm: Option<i64>,
    pub height_mm: Option<i64>,
    pub weight_g: Option<i64>,
    pub material: Option<String>,
    pub color: Option<String>,
    pub is_returnable: i64,
    pub deposit_value: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CrateTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub bottle_count: i64,
    pub bottle_profile_id: Option<i64>,
    pub dimensions_cm: Option<String>,
    pub weight_g: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CompatibilityGroupDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct DisposablePackagingTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub material: Option<String>,
    pub volume_ml: Option<i64>,
    pub weight_g: Option<i64>,
    pub is_recyclable: i64,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PackagingMaterialDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ContainerTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub material_id: i64,
    pub volume_ml: i64,
    pub weight_g: Option<i64>,
    pub dimensions_cm: Option<String>,
    pub is_returnable: i64,
    pub deposit_value: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct UnitOfMeasureDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub symbol: String,
    pub base_unit_id: Option<i64>,
    pub conversion_factor: Option<f64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SupplierProductPriceDto {
    pub id: i64,
    pub supplier_id: i64,
    pub product_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub price_fcfa: i64,
    pub currency: String,
    pub valid_from: String,
    pub valid_to: Option<String>,
    pub min_order_qty: Option<i64>,
    pub lead_time_days: Option<i64>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CustomerPriceListDto {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub currency: String,
    pub is_default: i64,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CustomerPriceListItemDto {
    pub id: i64,
    pub price_list_id: i64,
    pub product_id: Option<i64>,
    pub variant_id: Option<i64>,
    pub packaging_id: Option<i64>,
    pub price_fcfa: i64,
    pub valid_from: String,
    pub valid_to: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PackagingValueDto {
    pub id: i64,
    pub returnable_id: i64,
    pub packaging_type: String,
    pub value_fcfa: i64,
    pub effective_from: String,
    pub effective_to: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PriceHistoryDto {
    pub id: i64,
    pub entity_type: String,
    pub entity_id: i64,
    pub field_name: String,
    pub old_value: Option<i64>,
    pub new_value: i64,
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
