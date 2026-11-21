// ============================================================================
// Caisse, créances clients et dépenses : DTOs & sous-modules
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::application::sales::PaymentPartInput;

mod expenses;
mod receivables;
mod sessions;

pub use expenses::{
    create_expense, list_expenses, ExpenseCategoryDto, ExpenseItemDto, ExpensesOverviewDto,
};
pub use receivables::{list_receivables, pay_receivable};
pub use sessions::{close_cash_session, get_cash_status, open_cash_session};

#[derive(Debug, Serialize, FromRow)]
pub struct CashSessionDto {
    pub id: i64,
    pub reference: String,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub status: String,
    pub opening_cash: i64,
    pub theoretical_cash: Option<i64>,
    pub physical_cash: Option<i64>,
    pub difference: Option<i64>,
    pub closing_notes: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct MethodSummaryDto {
    pub method_code: String,
    pub label: String,
    pub is_cash: i64,
    pub total_in: i64,
    pub total_out: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct CashMovementDto {
    pub id: i64,
    pub kind: String,
    pub method_code: String,
    pub method_label: String,
    pub is_cash: i64,
    pub direction: String,
    pub amount: i64,
    pub description: String,
    pub reference_document: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashSummaryDto {
    pub theoretical_cash: i64,
    pub by_method: Vec<MethodSummaryDto>,
    pub movements: Vec<CashMovementDto>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CashStatusDto {
    pub active_session: Option<CashSessionDto>,
    pub summary: Option<CashSummaryDto>,
    pub history: Vec<CashSessionDto>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ReceivableDto {
    pub id: i64,
    pub sale_id: i64,
    pub sale_reference: String,
    pub sale_date: String,
    pub sale_total: i64,
    pub client_id: i64,
    pub client_name: String,
    pub client_code: String,
    pub client_phone: Option<String>,
    pub initial_amount: i64,
    pub remaining_amount: i64,
    pub due_date: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct OpenCashInput {
    pub opening_cash: i64,
    pub request_key: String,
}

#[derive(Debug, Deserialize)]
pub struct CloseCashInput {
    pub session_id: i64,
    pub physical_cash: i64,
    pub closing_notes: Option<String>,
    pub request_key: String,
}

#[derive(Debug, Deserialize)]
pub struct PayReceivableInput {
    pub request_key: String,
    pub note: Option<String>,
    pub parts: Vec<PaymentPartInput>,
}

#[derive(Debug, Deserialize)]
pub struct CreateExpenseInput {
    pub request_key: String,
    pub category: String,
    pub amount: i64,
    pub method_code: String,
    pub beneficiary: Option<String>,
    pub notes: Option<String>,
    pub receipt_path: Option<String>,
    pub expense_date: Option<String>,
}
