// ============================================================================
// Structures d'entrée pour entités catalogue (marques, emballages, unités)
// ============================================================================

use serde::Deserialize;

use super::helpers::deserialize_opt_bool_or_int;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBrandInput {
    pub code: String,
    pub name: String,
    pub brewery_id: Option<i64>,
    pub country_of_origin: Option<String>,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBrandInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub brewery_id: Option<Option<i64>>,
    pub country_of_origin: Option<Option<String>>,
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProductVariantInput {
    pub product_id: i64,
    pub name: String,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub volume_ml: Option<i64>,
    pub container_type: Option<String>,
    pub container_type_id: Option<i64>,
    pub container_material: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub container_returnable: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub container_recyclable: Option<bool>,
    pub container_deposit_amount: Option<i64>,
    pub net_weight_g: Option<i64>,
    pub bottle_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub compatibility_group_id: Option<i64>,
    pub disposable_packaging_id: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProductVariantInput {
    pub name: Option<String>,
    pub sku: Option<Option<String>>,
    pub barcode: Option<Option<String>>,
    pub volume_ml: Option<Option<i64>>,
    pub container_type: Option<Option<String>>,
    pub container_type_id: Option<Option<i64>>,
    pub container_material: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub container_returnable: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub container_recyclable: Option<bool>,
    pub container_deposit_amount: Option<i64>,
    pub net_weight_g: Option<Option<i64>>,
    pub bottle_profile_id: Option<Option<i64>>,
    pub crate_type_id: Option<Option<i64>>,
    pub compatibility_group_id: Option<Option<i64>>,
    pub disposable_packaging_id: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBottleProfileInput {
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
    pub deposit_value: Option<i64>,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBottleProfileInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub producer: Option<String>,
    pub material: Option<String>,
    pub capacity_ml: Option<i64>,
    pub diameter_mm: Option<Option<i64>>,
    pub height_mm: Option<Option<i64>>,
    pub weight_g: Option<Option<i64>>,
    pub base_type: Option<Option<String>>,
    pub neck_type: Option<Option<String>>,
    pub compatibility_group_id: Option<Option<i64>>,
    pub deposit_value: Option<i64>,
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCrateTypeInput {
    pub code: String,
    pub name: String,
    pub producer: String,
    pub capacity: i64,
    pub bottle_capacity_ml: i64,
    pub bottle_profile_id: i64,
    pub compatibility_group_id: Option<i64>,
    pub dimensions: Option<String>,
    pub weight_g: Option<i64>,
    pub material: Option<String>,
    pub deposit_value: Option<i64>,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCrateTypeInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub producer: Option<String>,
    pub capacity: Option<i64>,
    pub bottle_capacity_ml: Option<i64>,
    pub bottle_profile_id: Option<i64>,
    pub compatibility_group_id: Option<Option<i64>>,
    pub dimensions: Option<Option<String>>,
    pub weight_g: Option<Option<i64>>,
    pub material: Option<String>,
    pub deposit_value: Option<i64>,
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCompatibilityGroupInput {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allows_mixed_brands: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allows_mixed_volumes: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCompatibilityGroupInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allows_mixed_brands: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allows_mixed_volumes: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}
