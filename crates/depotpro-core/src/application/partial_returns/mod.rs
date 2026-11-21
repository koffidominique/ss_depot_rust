// ============================================================================
// Retours partiels d'emballages : types, DTOs & sous-modules
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

mod operations;

pub use operations::{
    create_partial_return, create_pending_partial_return, get_partial_returns_overview,
    update_pending_return,
};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "TEXT")]
pub enum ConditionState {
    #[serde(rename = "good")]
    Good,
    #[serde(rename = "damaged")]
    Damaged,
    #[serde(rename = "lost")]
    Lost,
    #[serde(rename = "partial")]
    Partial,
}

impl std::fmt::Display for ConditionState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConditionState::Good => f.write_str("good"),
            ConditionState::Damaged => f.write_str("damaged"),
            ConditionState::Lost => f.write_str("lost"),
            ConditionState::Partial => f.write_str("partial"),
        }
    }
}

#[derive(Debug, Serialize, FromRow)]
pub struct PartialReturnItemDto {
    pub id: i64,
    pub return_id: i64,
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub quantity: i64,
    pub condition_state: String,
    pub unit_refund_value: i64,
    pub total_refund_amount: i64,
    pub is_accepted: bool,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PendingPartialReturnDto {
    pub id: i64,
    pub client_id: i64,
    pub client_name: String,
    pub sale_id: i64,
    pub sale_reference: String,
    pub total_expected_pieces: i64,
    pub total_returned_pieces: i64,
    pub remaining_pieces: i64,
    pub status: String,
    pub created_at: String,
    pub last_updated_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PartialReturnOverviewDto {
    pub pending_returns: Vec<PendingPartialReturnDto>,
    pub recent_partial_returns: Vec<PartialReturnItemDto>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePartialReturnInput {
    pub client_id: i64,
    pub sale_id: i64,
    pub items: Vec<PartialReturnItemInput>,
    pub reason: String,
    pub payment_method_code: String,
    pub request_key: String,
}

#[derive(Debug, Deserialize)]
pub struct PartialReturnItemInput {
    pub component_type: String,
    pub component_profile_id: Option<i64>,
    pub crate_type_id: Option<i64>,
    pub quantity: i64,
    pub condition_state: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePendingReturnInput {
    pub pending_return_id: i64,
    pub items: Vec<PartialReturnItemInput>,
    pub status: String,
    pub request_key: String,
}
