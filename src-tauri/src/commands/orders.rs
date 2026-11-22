// ============================================================================
// Commandes IPC Tauri : Commandes clientèle mixtes, emballages & consignes
// ============================================================================

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::orders;
use tauri::State;

use super::verify_desktop_perm;
use crate::state::DesktopState;

#[tauri::command]
pub async fn compose_order_preview_v4(
    state: State<'_, DesktopState>,
    token: String,
    payload: orders::ComposePreviewInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::compose_preview(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_orders_v4(
    state: State<'_, DesktopState>,
    token: String,
    filter: orders::OrderListFilter,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::list_orders(&db, filter))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_order_v4(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::get_order(&db, id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn issue_order_receipt_v4(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::issue_or_get_customer_order_receipt(&db, id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_order_receipts_v4(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::list_customer_order_receipt_snapshots(&db, id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn revise_order_receipt_v4(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
    payload: orders::CreateCustomerOrderReceiptRevisionInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(
        actor,
        orders::create_customer_order_receipt_revision(&db, id, payload.reason),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_order_v4(
    state: State<'_, DesktopState>,
    token: String,
    payload: orders::CreateOrderInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::create_order(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_order_v4(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
    payload: orders::UpdateOrderInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::update_order(&db, id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn confirm_order_v4(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::confirm_order(&db, id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn deliver_order_v4(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::deliver_order(&db, id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn invoice_order_v4(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::invoice_order(&db, id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pay_order_v4(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
    payload: orders::PayOrderInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::pay_order(&db, id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_order_v4(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesCancelReturn).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::cancel_order(&db, id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn return_order_packaging_v4(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
    payload: orders::OrderReturnInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::return_order_packaging(&db, id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_packaging_assets_v4(
    state: State<'_, DesktopState>,
    token: String,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::CatalogRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::list_packaging_assets(&db))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_customer_deposits_v4(
    state: State<'_, DesktopState>,
    token: String,
    customer_id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(actor, orders::get_customer_deposits(&db, customer_id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_customer_deposit_history_v4(
    state: State<'_, DesktopState>,
    token: String,
    customer_id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsRead).await?;
    let db = state.db().await;
    let res = auth::with_actor(
        actor,
        orders::get_customer_deposit_history(&db, customer_id),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn return_customer_deposits_v4(
    state: State<'_, DesktopState>,
    token: String,
    customer_id: i64,
    payload: orders::OrderReturnInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ConsignmentsWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(
        actor,
        orders::return_customer_deposits(&db, customer_id, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}
