// ============================================================================
// DTOs et entrées pour commandes clientèle mixtes & consignes physiques
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PackagingAssetDto {
    pub id: i64,
    pub code: Option<String>,
    pub name: String,
    pub packaging_type_id: Option<i64>,
    pub returnable_id: Option<i64>,
    pub capacity: i64,
    pub deposit_value: i64,
    pub currency: String,
    pub returnable: i64,
    pub compatibility_class: String,
    pub stock_empty: i64,
    pub stock_full: i64,
    pub is_active: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderLineInput {
    pub variant_id: i64,
    pub requested_unit: String,
    pub requested_quantity: i64,
    pub unit_price_xof: Option<i64>,
    pub discount_xof: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderAllocationOverrideInput {
    pub packaging_asset_id: i64,
    pub quantity: i64,
    pub is_consigned: bool,
    pub deposit_amount_xof: Option<i64>,
    pub provided_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateOrderInput {
    pub customer_id: i64,
    pub order_type: Option<String>,
    pub payment_method: Option<String>,
    pub discount_xof: Option<i64>,
    pub tax_xof: Option<i64>,
    pub delivery_date: Option<String>,
    pub delivery_address: Option<String>,
    pub notes: Option<String>,
    pub allow_price_override: Option<bool>,
    pub lines: Vec<OrderLineInput>,
    pub allocations: Option<Vec<OrderAllocationOverrideInput>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateOrderInput {
    pub customer_id: Option<i64>,
    pub order_type: Option<String>,
    pub payment_method: Option<String>,
    pub discount_xof: Option<i64>,
    pub tax_xof: Option<i64>,
    pub delivery_date: Option<Option<String>>,
    pub delivery_address: Option<Option<String>>,
    pub notes: Option<Option<String>>,
    pub allow_price_override: Option<bool>,
    pub lines: Option<Vec<OrderLineInput>>,
    pub allocations: Option<Vec<OrderAllocationOverrideInput>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComposePreviewInput {
    pub lines: Vec<OrderLineInput>,
    pub discount_xof: Option<i64>,
    pub tax_xof: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderTotalsDto {
    pub subtotal_xof: i64,
    pub deposit_total_xof: i64,
    pub discount_xof: i64,
    pub tax_xof: i64,
    pub total_xof: i64,
    pub deposit_due_xof: i64,
    pub total_to_collect_xof: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewAllocationDto {
    pub packaging_asset_id: i64,
    pub packaging_name: String,
    pub compatibility_class: String,
    pub capacity: i64,
    pub quantity: i64,
    pub is_consigned: bool,
    pub deposit_amount_xof: i64,
    pub total_deposit_xof: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewLineDto {
    pub variant_id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub variant_name: String,
    pub compatibility_class: String,
    pub requested_unit: String,
    pub requested_quantity: i64,
    pub units_per_requested_unit: i64,
    pub base_quantity: i64,
    pub unit_price_xof: i64,
    pub discount_xof: i64,
    pub line_total_xof: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComposePreviewResult {
    pub lines: Vec<PreviewLineDto>,
    pub allocations: Vec<PreviewAllocationDto>,
    pub warnings: Vec<String>,
    pub totals: OrderTotalsDto,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct OrderSummaryDto {
    pub id: i64,
    pub order_number: String,
    pub customer_id: i64,
    pub customer_name: String,
    pub order_type: String,
    pub status: String,
    pub subtotal_xof: i64,
    pub deposit_total_xof: i64,
    pub discount_xof: i64,
    pub tax_xof: i64,
    pub total_xof: i64,
    pub deposit_due_xof: i64,
    pub total_to_collect_xof: i64,
    pub paid_xof: i64,
    pub payment_status: String,
    pub payment_method: Option<String>,
    pub delivery_date: Option<String>,
    pub delivery_address: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct OrderLineDto {
    pub id: i64,
    pub order_id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub variant_id: i64,
    pub variant_name: String,
    pub compatibility_class: Option<String>,
    pub requested_unit: String,
    pub requested_quantity: i64,
    pub base_quantity: i64,
    pub unit_price_xof: i64,
    pub line_total_xof: i64,
    pub discount_xof: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct OrderPackagingAllocationDto {
    pub id: i64,
    pub order_id: i64,
    pub packaging_asset_id: i64,
    pub packaging_name: String,
    pub compatibility_class: String,
    pub capacity: i64,
    pub quantity: i64,
    pub is_consigned: i64,
    pub deposit_amount_xof: i64,
    pub provided_by: Option<String>,
    pub returned_quantity: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct OrderLinePackagingLinkDto {
    pub id: i64,
    pub order_line_id: i64,
    pub order_packaging_allocation_id: i64,
    pub units_in_packaging: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CustomerDepositBalanceDto {
    pub id: i64,
    pub customer_id: i64,
    pub packaging_asset_id: i64,
    pub packaging_name: String,
    pub compatibility_class: String,
    pub deposit_value: i64,
    pub quantity_held: i64,
    pub amount_held_xof: i64,
    pub last_movement_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PackagingMovementDto {
    pub id: i64,
    pub packaging_asset_id: i64,
    pub packaging_name: String,
    pub customer_id: Option<i64>,
    pub order_id: Option<i64>,
    pub order_packaging_allocation_id: Option<i64>,
    pub movement_type: String,
    pub quantity: i64,
    pub unit_deposit_xof: i64,
    pub total_deposit_xof: i64,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OrderDetailDto {
    pub order: OrderSummaryDto,
    pub lines: Vec<OrderLineDto>,
    pub allocations: Vec<OrderPackagingAllocationDto>,
    pub links: Vec<OrderLinePackagingLinkDto>,
    pub customer_deposits: Vec<CustomerDepositBalanceDto>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PayOrderInput {
    pub amount_xof: i64,
    pub method: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OrderReturnInput {
    pub packaging_asset_id: i64,
    pub quantity: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OrderListFilter {
    pub status: Option<String>,
    pub customer_id: Option<i64>,
    pub from: Option<String>,
    pub to: Option<String>,
}
