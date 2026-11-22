// ============================================================================
// Tableaux de bord, rapports de gestion et paramètres applicatifs
// ============================================================================

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use crate::application::products::{deserialize_nullable_opt, deserialize_opt_bool_or_int};

mod dashboard;
mod overview;
mod settings;

pub use dashboard::{get_dashboard_data, get_dashboard_kpis};
pub use overview::get_reports_overview;
pub use settings::{
    add_payment_method, get_settings, get_settings_bundle, toggle_payment_method, update_settings,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardKpisDto {
    pub revenue_merchandise: i64,
    pub deposits_total: i64,
    pub sales_count: i64,
    pub collections_total: i64,
    pub receivables_total: i64,
    pub receivables_count: i64,
    pub overdue_receivables_total: i64,
    pub overdue_receivables_count: i64,
    pub supplier_debts_total: i64,
    pub supplier_debts_count: i64,
    pub overdue_supplier_debts_total: i64,
    pub overdue_supplier_debts_count: i64,
    pub expenses_total: i64,
    pub cash_session_open: bool,
    pub cash_session_reference: Option<String>,
    pub cash_physical_theoretical: i64,
    pub digital_session_total: i64,
    pub low_stock_count: i64,
    pub out_of_stock_count: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct LowStockProductDto {
    pub id: i64,
    pub reference: String,
    pub name: String,
    pub base_unit: String,
    pub stock_milli: i64,
    pub min_stock_milli: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct TopProductDto {
    pub product_id: i64,
    pub product_name: String,
    pub base_unit: String,
    pub total_base_milli: i64,
    pub total_revenue: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct SalesSeriesPointDto {
    pub day: String,
    pub count: i64,
    pub revenue: i64,
    pub collected: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct RecentAuditDto {
    pub id: i64,
    pub action: String,
    pub entity_type: String,
    pub details: String,
    pub actor_user_id: Option<String>,
    pub actor_name: Option<String>,
    pub actor_role: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardDataDto {
    pub kpis: DashboardKpisDto,
    pub low_stock_products: Vec<LowStockProductDto>,
    pub top_products: Vec<TopProductDto>,
    pub sales_series: Vec<SalesSeriesPointDto>,
    pub recent_audit: Vec<RecentAuditDto>,
}

#[derive(Debug, Serialize)]
pub struct CommercialReportDto {
    pub count: i64,
    pub merchandise_revenue: i64,
    pub deposit_billed: i64,
    pub paid_amount: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfitabilityDto {
    pub known_cost_total: i64,
    pub known_cost_revenue: i64,
    pub known_gross_margin: i64,
    pub unknown_cost_lines: i64,
    pub expenses_total: i64,
    pub net_known_result: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PaymentBreakdownDto {
    pub code: String,
    pub label: String,
    pub is_cash: i64,
    pub total_in: i64,
    pub total_out: i64,
}

#[derive(Debug, Serialize)]
pub struct StockReportDto {
    pub product_count: i64,
    pub unknown_cost_products: i64,
    #[serde(rename = "knownValuationFcfa")]
    pub known_valuation_fcfa: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DailySalePointDto {
    pub day: String,
    pub count: i64,
    pub revenue: i64,
    pub deposit: i64,
    pub collected: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportsOverviewDto {
    pub commercial: CommercialReportDto,
    pub profitability: ProfitabilityDto,
    pub payment_breakdown: Vec<PaymentBreakdownDto>,
    pub stock: StockReportDto,
    pub daily_sales: Vec<DailySalePointDto>,
}

#[derive(Debug, Deserialize, Serialize, FromRow)]
pub struct AppSettingsDto {
    pub company_name: String,
    pub company_legal_name: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    pub currency: String,
    pub allow_negative_stock: i64,
    pub invoice_prefix: String,
    pub sale_prefix: String,
    pub purchase_prefix: String,
    pub order_prefix: String,
    pub receipt_prefix: String,
    pub credit_note_prefix: String,
    pub theme: String,
    pub logo_path: Option<String>,
    pub setup_completed: i64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PaymentMethodDto {
    pub code: String,
    pub label: String,
    pub is_cash: i64,
    pub active: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsBundleDto {
    pub settings: AppSettingsDto,
    pub payment_methods: Vec<PaymentMethodDto>,
}

#[derive(Debug, Default, Deserialize)]
pub struct UpdateSettingsInput {
    pub company_name: Option<String>,
    pub company_legal_name: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub city: Option<String>,
    pub country: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub allow_negative_stock: Option<bool>,
    pub invoice_prefix: Option<String>,
    pub sale_prefix: Option<String>,
    pub purchase_prefix: Option<String>,
    pub order_prefix: Option<String>,
    pub receipt_prefix: Option<String>,
    pub credit_note_prefix: Option<String>,
    pub theme: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_opt")]
    pub logo_path: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_bool_or_int")]
    pub setup_completed: Option<bool>,
}
