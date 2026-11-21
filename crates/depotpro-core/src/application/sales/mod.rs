// ============================================================================
// Ventes, clients, crédits, annulations et retours
// ============================================================================

mod cancel;
mod client_updates;
mod clients;
mod create;
mod create_deposit_helpers;
mod create_helpers;
mod create_line_resolver;
mod create_persistence;
mod dtos;
mod helpers;
mod queries;
mod returns;
mod returns_helpers;

pub use cancel::cancel_sale;
pub use client_updates::{update_client, update_client_credit_policy};
pub use clients::{create_client, list_clients};
pub use create::{create_sale, create_sale_v4};
pub use dtos::{
    CancelSaleInput, ClientCreditSettingsDto, ClientSummaryDto, CreateClientInput, CreateSaleInput,
    CreateSaleLineInput, CreateSaleLineV4Input, CreateSaleReturnInput, CreateSaleV4Input,
    PaginatedSalesDto, PaymentPartInput, SaleCancellationDto, SaleDepositDto, SaleDetailDto,
    SaleLineDto, SalePaymentDto, SaleReturnDto, SaleReturnLineInput, SaleSummaryDto,
    UpdateClientInput, UpdateCreditPolicyInput,
};
pub(crate) use helpers::{audit_log_tx, get_theoretical_cash_tx, require_open_session_tx};
pub use queries::{get_sale_detail, list_sales};
pub use returns::create_sale_return;
