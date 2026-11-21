// ============================================================================
// Commandes IPC Tauri : Retours partiels & validation POS / compatibilité
// ============================================================================

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::{partial_returns, sales_validation};
use tauri::State;

use super::verify_desktop_perm;
use crate::state::DesktopState;

// ----------------------------------------------------------------------------
// 1. Retours partiels
// ----------------------------------------------------------------------------

#[tauri::command]
pub async fn get_partial_returns_overview_pc(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsRead).await?;
    let db = state.db().await;
    let ov = auth::with_actor(actor, partial_returns::get_partial_returns_overview(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(ov).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_partial_return_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: partial_returns::CreatePartialReturnInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let items = auth::with_actor(actor, partial_returns::create_partial_return(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(items).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_pending_partial_returns_pc(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsRead).await?;
    let db = state.db().await;
    let list = auth::with_actor(actor, async {
        Ok::<_, depotpro_core::CoreError>(
            partial_returns::get_partial_returns_overview(&db)
                .await?
                .pending_returns,
        )
    })
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(list).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_pending_partial_return_pc(
    state: State<'_, DesktopState>,
    token: String,
    client_id: i64,
    sale_id: i64,
    total_expected_pieces: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let p = auth::with_actor(
        actor,
        partial_returns::create_pending_partial_return(
            &db,
            client_id,
            sale_id,
            total_expected_pieces,
        ),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_pending_partial_return_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: partial_returns::UpdatePendingReturnInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let p = auth::with_actor(actor, partial_returns::update_pending_return(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(p).map_err(|e| e.to_string())
}

// ----------------------------------------------------------------------------
// 2. Validation POS & règles de compatibilité
// ----------------------------------------------------------------------------

#[tauri::command]
pub async fn get_pos_validation_config_pc(
    state: State<'_, DesktopState>,
    token: String,
    terminal_id: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let c = auth::with_actor(
        actor,
        sales_validation::get_pos_validation_config(&db, &terminal_id),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(c).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_pos_validation_config_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: sales_validation::UpdatePosConfigInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SettingsWrite).await?;
    let db = state.db().await;
    let c = auth::with_actor(
        actor,
        sales_validation::update_pos_validation_config(&db, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(c).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn validate_sale_compatibility_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: sales_validation::ValidateSaleInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let r = auth::with_actor(
        actor,
        sales_validation::validate_sale_compatibility(&db, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(r).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_compatibility_rules_pc(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let list = auth::with_actor(actor, sales_validation::get_compatibility_rules(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(list).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_compatibility_rule_pc(
    state: State<'_, DesktopState>,
    token: String,
    payload: sales_validation::CreateCompatibilityRuleInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SettingsWrite).await?;
    let db = state.db().await;
    let r = auth::with_actor(
        actor,
        sales_validation::create_compatibility_rule(&db, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(r).map_err(|e| e.to_string())
}
