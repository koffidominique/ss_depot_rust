// ============================================================================
// Consignes d'emballages retournables : types, stocks & retours clients
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

mod client_returns;
mod overview;
mod return_helpers;
mod types_and_stock;

pub use client_returns::return_client_empties;
pub use overview::get_overview;
pub use types_and_stock::{adjust_returnable_stock, create_returnable_type};

#[derive(Debug, Serialize, FromRow)]
pub struct ReturnableTypeDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub producer: String,
    pub kind: String,
    pub description: Option<String>,
    pub deposit_value: i64,
    pub stock_quantity: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ClientPackagingBalanceDto {
    pub id: i64,
    pub client_id: i64,
    pub client_name: String,
    pub client_code: String,
    pub returnable_id: i64,
    pub packaging_name: String,
    pub packaging_code: String,
    pub deposit_value: i64,
    pub balance_pieces: i64,
    pub deposit_held_amount: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ReturnableMovementDto {
    pub id: i64,
    pub packaging_id: i64,
    pub packaging_name: String,
    pub packaging_code: String,
    pub movement_type: String,
    pub quantity: i64,
    pub stock_before: Option<i64>,
    pub stock_after: i64,
    pub reason: String,
    pub reference_document: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct OpenDepositIssueDto {
    pub id: i64,
    pub sale_id: i64,
    pub sale_reference: String,
    pub client_id: Option<i64>,
    pub client_name: Option<String>,
    pub returnable_id: i64,
    pub packaging_name: String,
    pub packaging_code: String,
    pub pieces: i64,
    pub returned_pieces: i64,
    pub unit_value: i64,
    pub amount: i64,
    pub expected_products: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct DepositReturnDto {
    pub id: i64,
    pub reference: String,
    pub packaging_name: String,
    pub client_name: Option<String>,
    pub pieces: i64,
    pub condition_state: String,
    pub refund_amount: i64,
    pub credit_reduction: i64,
    pub method_label: String,
    pub reason: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsignmentsOverviewDto {
    pub types: Vec<ReturnableTypeDto>,
    pub client_balances: Vec<ClientPackagingBalanceDto>,
    pub recent_movements: Vec<ReturnableMovementDto>,
    pub open_issues: Vec<OpenDepositIssueDto>,
    pub returns: Vec<DepositReturnDto>,
}

#[derive(Debug, Deserialize)]
pub struct CreateReturnableTypeInput {
    pub code: String,
    pub name: String,
    pub producer: String,
    pub kind: String,
    pub deposit_value: i64,
    pub initial_stock: Option<i64>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AdjustReturnableStockInput {
    pub packaging_id: i64,
    pub movement_type: String,
    pub quantity: i64,
    pub reason: String,
    pub request_key: String,
}

#[derive(Debug, Deserialize)]
pub struct ReturnClientEmptiesInput {
    pub issue_id: i64,
    pub pieces: i64,
    pub condition_state: String,
    pub refund_amount: i64,
    pub credit_reduction: i64,
    pub method_code: String,
    pub reason: String,
    pub request_key: String,
}
