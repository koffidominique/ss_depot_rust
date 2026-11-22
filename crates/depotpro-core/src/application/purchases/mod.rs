// ============================================================================
// Achats fournisseurs : fiches fournisseurs, commandes, réceptions & dettes
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::application::products::{deserialize_nullable_opt, deserialize_qty_str};

mod debts;
mod order_queries;
mod orders;
mod receipt_helpers;
mod receipts;
mod suppliers;

pub use debts::{list_supplier_debts, pay_supplier_debt};
pub use order_queries::list_purchase_orders;
pub use orders::{cancel_purchase_order, create_purchase_order, update_purchase_order};
pub use receipts::receive_purchase_order;
pub use suppliers::{create_supplier, list_suppliers, update_supplier};

#[derive(Debug, Serialize, FromRow)]
pub struct SupplierSummaryDto {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub company_name: Option<String>,
    pub phone: String,
    pub address: Option<String>,
    pub email: Option<String>,
    pub contact_person: Option<String>,
    pub payment_terms_days: i64,
    pub is_active: i64,
    pub total_purchases: i64,
    pub balance_due: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PurchaseOrderLineDto {
    pub id: i64,
    pub product_id: i64,
    pub packaging_id: i64,
    pub product_name: String,
    pub packaging_name: String,
    pub base_unit: String,
    pub coefficient_milli: i64,
    pub ordered_quantity_milli: i64,
    pub received_quantity_milli: i64,
    pub unit_price: i64,
    pub line_total: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub(crate) struct PurchaseOrderRow {
    pub id: i64,
    pub reference: String,
    pub supplier_id: i64,
    pub supplier_name: String,
    pub supplier_code: String,
    pub supplier_phone: String,
    pub supplier_address: Option<String>,
    pub supplier_email: Option<String>,
    pub status: String,
    pub approval_status: Option<String>,
    pub total_amount: i64,
    pub received_amount: i64,
    pub expected_date: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct PurchaseOrderDto {
    pub id: i64,
    pub reference: String,
    pub supplier_id: i64,
    pub supplier_name: String,
    pub supplier_code: String,
    pub supplier_phone: String,
    pub supplier_address: Option<String>,
    pub supplier_email: Option<String>,
    pub status: String,
    pub approval_status: Option<String>,
    pub total_amount: i64,
    pub received_amount: i64,
    pub expected_date: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub lines: Vec<PurchaseOrderLineDto>,
    pub receipts: Vec<PurchaseReceiptDto>,
    pub debts: Vec<SupplierDebtDto>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PurchaseReceiptDto {
    pub id: i64,
    pub reference: String,
    pub purchase_order_id: i64,
    pub total_amount: i64,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SupplierDebtDto {
    pub id: i64,
    pub receipt_id: i64,
    pub supplier_id: i64,
    pub supplier_name: String,
    pub supplier_code: String,
    pub receipt_reference: String,
    pub order_reference: String,
    pub initial_amount: i64,
    pub remaining_amount: i64,
    pub due_date: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSupplierInput {
    pub name: String,
    pub company_name: Option<String>,
    pub phone: String,
    pub address: Option<String>,
    pub email: Option<String>,
    pub contact_person: Option<String>,
    pub payment_terms_days: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSupplierInput {
    pub name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_opt")]
    pub company_name: Option<Option<String>>,
    pub phone: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_opt")]
    pub address: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_opt")]
    pub email: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_opt")]
    pub contact_person: Option<Option<String>>,
    pub payment_terms_days: Option<i64>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct PurchaseOrderLineInput {
    pub product_id: i64,
    pub packaging_id: i64,
    #[serde(deserialize_with = "deserialize_qty_str")]
    pub quantity: String,
    pub unit_price: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreatePurchaseOrderInput {
    pub request_key: String,
    pub supplier_id: i64,
    pub expected_date: Option<String>,
    pub notes: Option<String>,
    pub lines: Vec<PurchaseOrderLineInput>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePurchaseOrderInput {
    pub supplier_id: i64,
    pub lines: Vec<PurchaseOrderLineInput>,
}

#[derive(Debug, Deserialize)]
pub struct ReceiveLineInput {
    pub purchase_order_line_id: i64,
    #[serde(deserialize_with = "deserialize_qty_str")]
    pub received_quantity: String,
    pub discrepancy_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReceivePurchaseOrderInput {
    pub request_key: String,
    pub notes: Option<String>,
    pub lines: Vec<ReceiveLineInput>,
}

#[derive(Debug, Deserialize)]
pub struct CancelPurchaseOrderInput {
    pub reason: String,
}

#[derive(Debug, Deserialize)]
pub struct PaySupplierDebtInput {
    pub method_code: String,
    pub amount: i64,
    pub request_key: String,
    pub note: Option<String>,
}
