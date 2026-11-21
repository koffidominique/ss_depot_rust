// ============================================================================
// DTOs de sortie et énumérations pour composants d'emballage et profils
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum ComponentType {
    #[serde(rename = "crate_support")]
    CrateSupport,
    #[serde(rename = "bottle")]
    Bottle,
    #[serde(rename = "cap")]
    Cap,
    #[serde(rename = "label")]
    Label,
    #[serde(rename = "crate_assembled")]
    CrateAssembled,
    #[serde(rename = "other")]
    Other,
}

impl std::fmt::Display for ComponentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ComponentType::CrateSupport => f.write_str("crate_support"),
            ComponentType::Bottle => f.write_str("bottle"),
            ComponentType::Cap => f.write_str("cap"),
            ComponentType::Label => f.write_str("label"),
            ComponentType::CrateAssembled => f.write_str("crate_assembled"),
            ComponentType::Other => f.write_str("other"),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum MovementType {
    #[serde(rename = "inbound")]
    Inbound,
    #[serde(rename = "outbound")]
    Outbound,
    #[serde(rename = "adjustment")]
    Adjustment,
    #[serde(rename = "return")]
    Return,
    #[serde(rename = "loss")]
    Loss,
    #[serde(rename = "damage")]
    Damage,
    #[serde(rename = "assembly")]
    Assembly,
    #[serde(rename = "disassembly")]
    Disassembly,
}

impl std::fmt::Display for MovementType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MovementType::Inbound => f.write_str("inbound"),
            MovementType::Outbound => f.write_str("outbound"),
            MovementType::Adjustment => f.write_str("adjustment"),
            MovementType::Return => f.write_str("return"),
            MovementType::Loss => f.write_str("loss"),
            MovementType::Damage => f.write_str("damage"),
            MovementType::Assembly => f.write_str("assembly"),
            MovementType::Disassembly => f.write_str("disassembly"),
        }
    }
}

#[derive(Debug, Serialize, FromRow)]
pub struct CrateComponentDto {
    pub id: i64,
    pub crate_type_id: i64,
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub quantity_per_crate: i64,
    pub deposit_value: i64,
    pub is_required: bool,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PackagingComponentStockDto {
    pub id: i64,
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub stock_quantity: i64,
    pub reserved_quantity: i64,
    pub deposit_value: i64,
    pub last_counted_at: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CustomerPackagingComponentBalanceDto {
    pub id: i64,
    pub client_id: i64,
    pub client_name: String,
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub balance_pieces: i64,
    pub deposit_held_amount: i64,
    pub last_transaction_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PackagingComponentMovementDto {
    pub id: i64,
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub movement_type: String,
    pub quantity: i64,
    pub stock_before: i64,
    pub stock_after: i64,
    pub reason: String,
    pub reference_document: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CrateAssemblyRecordDto {
    pub id: i64,
    pub crate_type_id: i64,
    pub crate_name: String,
    pub assembled_quantity: i64,
    pub support_quantity_used: i64,
    pub bottle_quantity_used: i64,
    pub reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CrateDisassemblyRecordDto {
    pub id: i64,
    pub crate_type_id: i64,
    pub crate_name: String,
    pub disassembled_quantity: i64,
    pub support_quantity_recovered: i64,
    pub bottle_quantity_recovered: i64,
    pub reason: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagingComponentsOverviewDto {
    pub component_stock: Vec<PackagingComponentStockDto>,
    pub customer_balances: Vec<CustomerPackagingComponentBalanceDto>,
    pub recent_movements: Vec<PackagingComponentMovementDto>,
    pub crate_components: Vec<CrateComponentDto>,
    pub assembly_records: Vec<CrateAssemblyRecordDto>,
    pub disassembly_records: Vec<CrateDisassemblyRecordDto>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ProductVariantDto {
    pub id: i64,
    pub product_id: i64,
    pub name: String,
    pub volume_ml: Option<i64>,
    pub container_type: String,
    pub bottle_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub compatibility_group_id: Option<i64>,
    pub disposable_packaging_id: Option<i64>,
    pub barcode: Option<String>,
    pub is_active: bool,
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
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
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
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ContainerTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub is_returnable: bool,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
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
    pub is_returnable: bool,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
}
