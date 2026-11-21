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
    pub description: Option<String>,
    pub brewery_id: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBrandInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub brewery_id: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProductVariantInput {
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
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProductVariantInput {
    pub name: Option<String>,
    pub reference: Option<Option<String>>,
    pub barcode: Option<Option<String>>,
    pub volume_ml: Option<Option<i64>>,
    pub container_type: Option<Option<String>>,
    pub alcohol_degree: Option<Option<f64>>,
    pub bottle_profile_id: Option<Option<i64>>,
    pub crate_type_id: Option<Option<i64>>,
    pub compatibility_group_id: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBottleProfileInput {
    pub code: String,
    pub name: String,
    pub volume_ml: i64,
    pub diameter_mm: Option<i64>,
    pub height_mm: Option<i64>,
    pub weight_g: Option<i64>,
    pub material: Option<String>,
    pub color: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
    pub deposit_value: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBottleProfileInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub volume_ml: Option<i64>,
    pub diameter_mm: Option<Option<i64>>,
    pub height_mm: Option<Option<i64>>,
    pub weight_g: Option<Option<i64>>,
    pub material: Option<Option<String>>,
    pub color: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
    pub deposit_value: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCrateTypeInput {
    pub code: String,
    pub name: String,
    pub bottle_count: i64,
    pub bottle_profile_id: Option<i64>,
    pub dimensions_cm: Option<String>,
    pub weight_g: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCrateTypeInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub bottle_count: Option<i64>,
    pub bottle_profile_id: Option<Option<i64>>,
    pub dimensions_cm: Option<Option<String>>,
    pub weight_g: Option<Option<i64>>,
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
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCompatibilityGroupInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDisposablePackagingTypeInput {
    pub code: String,
    pub name: String,
    pub material: Option<String>,
    pub volume_ml: Option<i64>,
    pub weight_g: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_recyclable: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDisposablePackagingTypeInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub material: Option<Option<String>>,
    pub volume_ml: Option<Option<i64>>,
    pub weight_g: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_recyclable: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePackagingMaterialInput {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePackagingMaterialInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateContainerTypeInput {
    pub code: String,
    pub name: String,
    pub material_id: i64,
    pub volume_ml: i64,
    pub weight_g: Option<i64>,
    pub dimensions_cm: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
    pub deposit_value: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateContainerTypeInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub material_id: Option<i64>,
    pub volume_ml: Option<i64>,
    pub weight_g: Option<Option<i64>>,
    pub dimensions_cm: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
    pub deposit_value: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUnitOfMeasureInput {
    pub code: String,
    pub name: String,
    pub symbol: String,
    pub base_unit_id: Option<i64>,
    pub conversion_factor: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUnitOfMeasureInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub symbol: Option<String>,
    pub base_unit_id: Option<Option<i64>>,
    pub conversion_factor: Option<Option<f64>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}
