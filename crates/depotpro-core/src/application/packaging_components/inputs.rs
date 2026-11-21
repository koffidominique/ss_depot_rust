// ============================================================================
// Structures d'entrée pour composants d'emballage, casiers et profils
// ============================================================================

use serde::Deserialize;

#[derive(Debug, Deserialize)]
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
    pub material: String,
    pub deposit_value: i64,
    pub description: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCrateTypeInput {
    pub name: Option<String>,
    pub capacity: Option<i64>,
    pub bottle_capacity_ml: Option<i64>,
    pub compatibility_group_id: Option<i64>,
    pub dimensions: Option<String>,
    pub weight_g: Option<i64>,
    pub material: Option<String>,
    pub deposit_value: Option<i64>,
    pub description: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
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
    pub deposit_value: i64,
    pub description: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBottleProfileInput {
    pub name: Option<String>,
    pub material: Option<String>,
    pub capacity_ml: Option<i64>,
    pub diameter_mm: Option<i64>,
    pub height_mm: Option<i64>,
    pub weight_g: Option<i64>,
    pub base_type: Option<String>,
    pub neck_type: Option<String>,
    pub deposit_value: Option<i64>,
    pub description: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCrateComponentInput {
    pub crate_type_id: i64,
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub quantity_per_crate: i64,
    pub deposit_value: i64,
    pub is_required: bool,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateComponentStockInput {
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub movement_type: String,
    pub quantity: i64,
    pub reason: String,
    pub reference_document: Option<String>,
    pub request_key: String,
}

#[derive(Debug, Deserialize)]
pub struct AssembleCratesInput {
    pub crate_type_id: i64,
    pub quantity: i64,
    pub reason: Option<String>,
    pub request_key: String,
}

#[derive(Debug, Deserialize)]
pub struct DisassembleCratesInput {
    pub crate_type_id: i64,
    pub quantity: i64,
    pub reason: Option<String>,
    pub request_key: String,
}
