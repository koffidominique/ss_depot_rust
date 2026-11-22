// ============================================================================
// Commandes IPC Tauri : archive des reçus et bons de commande
// ============================================================================

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::documents;
use tauri::State;

use super::verify_desktop_perm;
use crate::state::DesktopState;

#[tauri::command]
pub async fn list_document_archive_v1(
    state: State<'_, DesktopState>,
    token: String,
    filter: documents::DocumentArchiveFilter,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let result = auth::with_actor(actor, documents::list_document_archive(&db, filter))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_document_archive_v1(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesRead).await?;
    let db = state.db().await;
    let result = auth::with_actor(actor, documents::get_document_archive(&db, id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn archive_sale_document_v1(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let result = auth::with_actor(actor, documents::archive_sale_document(&db, id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn archive_order_document_v1(
    state: State<'_, DesktopState>,
    token: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    let actor = verify_desktop_perm(&state, &token, Permission::SalesWrite).await?;
    let db = state.db().await;
    let result = auth::with_actor(actor, documents::archive_order_document(&db, id))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}
