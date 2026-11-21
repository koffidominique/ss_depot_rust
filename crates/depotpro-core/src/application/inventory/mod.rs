// ============================================================================
// Stock et inventaires physiques : DTOs, entrées & sous-modules
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::application::products::deserialize_qty_str;

mod balance_sync;
mod inventories;
mod stock_ops;

pub(crate) use balance_sync::sync_stock_balance_tx;
pub use inventories::{create_inventory, list_inventories, validate_inventory};
pub use stock_ops::{adjust_stock, get_stock_overview};

#[derive(Debug, Serialize, FromRow)]
pub struct StockProductDto {
    pub id: i64,
    pub reference: String,
    pub name: String,
    pub brand: Option<String>,
    pub category_name: String,
    pub base_unit: String,
    pub stock_milli: i64,
    pub min_stock_milli: i64,
    pub max_stock_milli: i64,
    pub average_cost_num: Option<String>,
    pub average_cost_den: Option<String>,
    pub is_active: i64,
}

#[derive(Debug, Serialize)]
pub struct StockProductEnrichedDto {
    pub id: i64,
    pub reference: String,
    pub name: String,
    pub brand: Option<String>,
    pub category_name: String,
    pub base_unit: String,
    pub stock_milli: i64,
    pub min_stock_milli: i64,
    pub max_stock_milli: i64,
    pub average_cost_num: Option<String>,
    pub average_cost_den: Option<String>,
    pub is_active: i64,
    pub average_cost_fcfa: Option<i64>,
    pub valuation_fcfa: Option<i64>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct StockMovementDto {
    pub id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub product_reference: String,
    pub base_unit: String,
    pub movement_type: String,
    pub quantity_milli: i64,
    pub stock_before_milli: i64,
    pub stock_after_milli: i64,
    pub unit_cost: Option<i64>,
    pub reason: Option<String>,
    pub reference_document: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct StockOverviewDto {
    pub products: Vec<StockProductEnrichedDto>,
    pub movements: Vec<StockMovementDto>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct InventoryLineDto {
    pub id: i64,
    pub inventory_id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub product_reference: String,
    pub base_unit: String,
    pub theoretical_milli: i64,
    pub counted_milli: Option<i64>,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub(super) struct InventoryRow {
    pub id: i64,
    pub reference: String,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub validated_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct InventoryDto {
    pub id: i64,
    pub reference: String,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub validated_at: Option<String>,
    pub lines: Vec<InventoryLineDto>,
}

#[derive(Debug, Deserialize)]
pub struct ValidateInventoryLineInput {
    pub product_id: i64,
    #[serde(deserialize_with = "deserialize_qty_str")]
    pub counted_quantity: String,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AdjustStockInput {
    pub product_id: i64,
    pub direction: String,
    #[serde(deserialize_with = "deserialize_qty_str")]
    pub quantity: String,
    pub reason: String,
    pub request_key: String,
}
