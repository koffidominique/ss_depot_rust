use depotpro_core::application::auth::{self, Permission, Role};
use depotpro_core::application::commercial_documents::{self, ReviewDecisionInput};
use tauri::State;
use crate::state::DesktopState;
use super::verify_desktop_perm;

#[tauri::command]
pub async fn list_commercial_documents(state: State<'_, DesktopState>, token: String, query: commercial_documents::CommercialDocumentsQuery) -> Result<serde_json::Value, String> {
    let actor = super::verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let rows = auth::with_actor(actor, commercial_documents::list_documents_page(&db, query)).await.map_err(|e| e.to_string())?;
    serde_json::to_value(rows).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_commercial_document_detail(state: State<'_, DesktopState>, token: String, document_type: String, document_id: i64) -> Result<serde_json::Value, String> {
    let actor = super::verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let detail = auth::with_actor(actor, commercial_documents::get_document_detail(&db, &document_type, document_id)).await.map_err(|e| e.to_string())?;
    serde_json::to_value(detail).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn submit_commercial_document(state: State<'_, DesktopState>, token: String, document_type: String, document_id: i64) -> Result<(), String> {
    let permission = match document_type.as_str() {
        "customer_order" => Permission::SalesWrite,
        "purchase_order" => Permission::PurchasesWrite,
        _ => return Err("Type de document invalide.".into()),
    };
    let actor = verify_desktop_perm(&state, &token, permission).await?;
    let db = state.db().await;
    auth::with_actor(actor, commercial_documents::submit_for_approval(&db, &document_type, document_id)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn review_commercial_document(state: State<'_, DesktopState>, token: String, document_type: String, document_id: i64, payload: ReviewDecisionInput) -> Result<(), String> {
    let actor = verify_desktop_perm(&state, &token, Permission::ReportsRead).await?;
    if actor.role != Role::Owner { return Err("Seul le propriétaire peut statuer sur une approbation.".into()); }
    let db = state.db().await;
    auth::with_actor(actor, commercial_documents::review_document(&db, &document_type, document_id, payload)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn commercial_document_events(state: State<'_, DesktopState>, token: String, document_type: String, document_id: i64) -> Result<serde_json::Value, String> {
    let actor = super::verify_desktop_session(&state, &token).await?;
    let db = state.db().await;
    let rows = auth::with_actor(actor, commercial_documents::approval_events(&db, &document_type, document_id)).await.map_err(|e| e.to_string())?;
    serde_json::to_value(rows).map_err(|e| e.to_string())
}
