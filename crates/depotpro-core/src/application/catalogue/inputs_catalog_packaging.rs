// ============================================================================
// Structures d'entrée catalogue : emballages jetables, matériaux & unités
// ============================================================================

use serde::Deserialize;

use super::helpers::deserialize_opt_bool_or_int;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDisposablePackagingTypeInput {
    pub code: String,
    pub name: String,
    pub packaging_type: String,
    pub units_per_pack: i64,
    pub unit_volume_ml: i64,
    pub material: String,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDisposablePackagingTypeInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub packaging_type: Option<String>,
    pub units_per_pack: Option<i64>,
    pub unit_volume_ml: Option<i64>,
    pub material: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePackagingMaterialInput {
    pub code: String,
    pub name: String,
    pub category: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_recyclable: Option<bool>,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePackagingMaterialInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub category: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_recyclable: Option<bool>,
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateContainerTypeInput {
    pub code: String,
    pub name: String,
    pub material: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_recyclable: Option<bool>,
    pub default_volume_ml: Option<i64>,
    pub default_deposit_value: Option<i64>,
    pub description: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateContainerTypeInput {
    pub code: Option<String>,
    pub name: Option<String>,
    pub material: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_returnable: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_recyclable: Option<bool>,
    pub default_volume_ml: Option<Option<i64>>,
    pub default_deposit_value: Option<i64>,
    pub description: Option<Option<String>>,
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
    pub conversion_factor_num: Option<i64>,
    pub conversion_factor_den: Option<i64>,
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
    pub conversion_factor_num: Option<i64>,
    pub conversion_factor_den: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub is_active: Option<bool>,
}
