// ============================================================================
// Commandes IPC Tauri : Clients, ventes, annulations & retours
// ============================================================================

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::sales;
use tauri::State;

use super::verify_desktop_perm;
use crate::state::DesktopState;

#[tauri::command]
pub async fn list_clients(
    state: State<'_, DesktopState>,
    token: String,
    search: Option<String>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let clients = auth::with_actor(actor, sales::list_clients(&db, search.as_deref()))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(clients).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_client(
    state: State<'_, DesktopState>,
    token: String,
    payload: sales::CreateClientInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let client = auth::with_actor(actor, sales::create_client(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(client).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_client(
    state: State<'_, DesktopState>,
    token: String,
    client_id: i64,
    payload: sales::UpdateClientInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let client = auth::with_actor(actor, sales::update_client(&db, client_id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(client).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_client_credit(
    state: State<'_, DesktopState>,
    token: String,
    client_id: i64,
    payload: sales::UpdateCreditPolicyInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let res = auth::with_actor(
        actor,
        sales::update_client_credit_policy(&db, client_id, payload),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn list_sales(
    state: State<'_, DesktopState>,
    token: String,
    search: Option<String>,
    status: Option<String>,
    from: Option<String>,
    to: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let p = page.unwrap_or(1).max(1);
    let ps = page_size.unwrap_or(25).clamp(1, 100);
    let res = auth::with_actor(
        actor,
        sales::list_sales(
            &db,
            search.as_deref(),
            status.as_deref(),
            from.as_deref(),
            to.as_deref(),
            ps,
            (p - 1) * ps,
        ),
    )
    .await
    .map_err(|e| e.to_string())?;
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sale_detail(
    state: State<'_, DesktopState>,
    token: String,
    sale_id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let detail = auth::with_actor(actor, sales::get_sale_detail(&db, sale_id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(detail).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_sale(
    state: State<'_, DesktopState>,
    token: String,
    payload: sales::CreateSaleV4Input,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let sale = auth::with_actor(actor, sales::create_sale_v4(&db, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(sale).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_sale(
    state: State<'_, DesktopState>,
    token: String,
    sale_id: i64,
    payload: sales::CancelSaleInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesCancelReturn).await?;
    let db = state.db().await;
    let sale = auth::with_actor(actor, sales::cancel_sale(&db, sale_id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(sale).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_sale_return(
    state: State<'_, DesktopState>,
    token: String,
    sale_id: i64,
    payload: sales::CreateSaleReturnInput,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesCancelReturn).await?;
    let db = state.db().await;
    let sale = auth::with_actor(actor, sales::create_sale_return(&db, sale_id, payload))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(sale).map_err(|e| e.to_string())
}
