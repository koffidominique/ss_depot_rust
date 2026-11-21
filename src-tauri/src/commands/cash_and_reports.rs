// ============================================================================
// Commandes IPC Tauri : Créances, caisse, dépenses, rapports, PDF & paramètres
// ============================================================================

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::{cash, pdf, reports};
use tauri::State;

use super::verify_desktop_perm;
use crate::state::DesktopState;

// ----------------------------------------------------------------------------
// 1. Créances, caisse & dépenses
// ----------------------------------------------------------------------------

#[tauri::command]
pub async fn list_receivables(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ReceivablesRead).await?;
    let db = state.db().await;
    let items = auth::with_actor(actor, cash::list_receivables(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(items).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pay_receivable(
    state: State<'_, DesktopState>,
    token: String,
    receivable_id: i64,
    payload: cash::PayReceivableInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ReceivablesPay).await?;
    let db = state.db().await;
    let rec = auth::with_actor(actor, cash::pay_receivable(&db, receivable_id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(rec).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_cash_status(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CashRead).await?;
    let db = state.db().await;
    let s = auth::with_actor(actor, cash::get_cash_status(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(s).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_cash_session(
    state: State<'_, DesktopState>,
    token: String,
    payload: cash::OpenCashInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CashOperate).await?;
    let db = state.db().await;
    let s = auth::with_actor(actor, cash::open_cash_session(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(s).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_cash_session(
    state: State<'_, DesktopState>,
    token: String,
    payload: cash::CloseCashInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CashOperate).await?;
    let db = state.db().await;
    let s = auth::with_actor(actor, cash::close_cash_session(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(s).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_expenses(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CashRead).await?;
    let db = state.db().await;
    let ov = auth::with_actor(actor, cash::list_expenses(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(ov).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_expense(
    state: State<'_, DesktopState>,
    token: String,
    payload: cash::CreateExpenseInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ExpensesWrite).await?;
    let db = state.db().await;
    let exp = auth::with_actor(actor, cash::create_expense(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(exp).map_err(|e| e.to_string())
}

// ----------------------------------------------------------------------------
// 2. Tableau de bord, rapports, PDF & paramètres
// ----------------------------------------------------------------------------

#[tauri::command]
pub async fn get_dashboard(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let data = auth::with_actor(actor, reports::get_dashboard_data(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_reports(
    state: State<'_, DesktopState>,
    token: String,
    from: Option<String>,
    to: Option<String>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ReportsRead).await?;
    let db = state.db().await;
    let rep = auth::with_actor(
        actor,
        reports::get_reports_overview(&db, from.as_deref(), to.as_deref()),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(rep).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_settings(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SettingsRead).await?;
    let db = state.db().await;
    let bundle = auth::with_actor(actor, reports::get_settings_bundle(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(bundle).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, DesktopState>,
    token: String,
    payload: reports::UpdateSettingsInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SettingsWrite).await?;
    let db = state.db().await;
    let bundle = auth::with_actor(actor, reports::update_settings(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(bundle).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_payment_method(
    state: State<'_, DesktopState>,
    token: String,
    label: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SettingsWrite).await?;
    let db = state.db().await;
    let pm = auth::with_actor(actor, reports::add_payment_method(&db, &label))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(pm).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_payment_method(
    state: State<'_, DesktopState>,
    token: String,
    code: String,
    active: bool,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SettingsWrite).await?;
    let db = state.db().await;
    let pm = auth::with_actor(actor, reports::toggle_payment_method(&db, &code, active))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(pm).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_document_pdf(
    state: State<'_, DesktopState>,
    token: String,
    doc: pdf::DocumentPdfInput,
) -> Result<Vec<u8>, String> {
    let needed = match doc.doc_type.as_str() {
        "BON_COMMANDE" | "BON_RECEPTION" => Permission::PurchasesRead,
        "CLOTURE_CAISSE" => Permission::CashRead,
        _ => Permission::SalesRead,
    };
    let actor = verify_desktop_perm(&state, &token, needed).await?;
    let db = state.db().await;
    let (_filename, bytes) = auth::with_actor(actor, pdf::generate_document_pdf(&db, doc))
        .await
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}
