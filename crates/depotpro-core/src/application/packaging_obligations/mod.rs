//! Gestion des obligations d'emballages, échéances, conversions en créances
//! financières, déclarations de perte et retours tardifs (MAJ.md sections 5-8).
//!
//! Règles clés :
//! - Une obligation physique n'est PAS une dette financière exigible avant échéance.
//! - La valeur unitaire appliquée est celle photographiée à la vente (`unit_value`).
//! - Les conversions sont idempotentes (converted_pieces + request_key UNIQUE).
//! - Les retours tardifs régularisent la créance par une contre-écriture, sans
//!   jamais modifier ni supprimer l'historique.

use serde::{Deserialize, Serialize};

mod conversions;
mod debt_and_dashboard;
mod late_returns;
mod ledger;
mod losses;

pub use conversions::{list_obligations, process_due_obligations};
pub use debt_and_dashboard::{
    get_client_packaging_dashboard, pay_packaging_financial_debt, ClientPackagingDashboardDto,
    PayPackagingDebtDto, PayPackagingDebtInput, PayPackagingPart,
};
pub use late_returns::register_late_return;
pub use ledger::get_client_packaging_financial_balance;
pub(crate) use ledger::{insert_ledger_entry, mark_converted};
pub use losses::{declare_loss, validate_loss_declaration};

#[derive(Debug, Serialize)]
pub struct PackagingObligationDto {
    pub id: i64,
    pub sale_id: i64,
    pub sale_reference: Option<String>,
    pub client_id: Option<i64>,
    pub returnable_id: i64,
    pub pieces: i64,
    pub returned_pieces: i64,
    pub lost_pieces: i64,
    pub destroyed_pieces: i64,
    pub converted_pieces: i64,
    pub pending_pieces: i64,
    pub unit_value: i64,
    pub total_reference_value: i64,
    pub due_date: Option<String>,
    pub overdue: bool,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct PackagingFinancialBalanceDto {
    pub client_id: i64,
    pub packaging_financial_balance: i64,
}

#[derive(Debug, Deserialize)]
pub struct DeclareLossInput {
    pub deposit_issue_id: i64,
    pub pieces: i64,
    pub reason: String,
    pub actor_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ConvertSummary {
    pub conversions: i64,
    pub total_amount: i64,
}
