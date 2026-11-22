use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};
use depotpro_core::application::auth::{self, Permission, Role};
use depotpro_core::application::commercial_documents::{self, ReviewDecisionInput};
use crate::state::{map_err, require_perm, AppState};

pub(crate) async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<commercial_documents::CommercialDocumentsQuery>,
) -> impl IntoResponse {
    let actor = match crate::state::require_auth(&state, &headers).await {
        Ok(actor) => actor,
        Err(err) => return err.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, commercial_documents::list_documents_page(&db, query)).await {
        Ok(rows) => (StatusCode::OK, Json(serde_json::to_value(rows).unwrap())).into_response(),
        Err(err) => map_err(err).into_response(),
    }
}

pub(crate) async fn detail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((document_type, id)): Path<(String, i64)>,
) -> impl IntoResponse {
    let actor = match crate::state::require_auth(&state, &headers).await {
        Ok(actor) => actor,
        Err(err) => return err.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, commercial_documents::get_document_detail(&db, &document_type, id)).await {
        Ok(detail) => (StatusCode::OK, Json(serde_json::to_value(detail).unwrap())).into_response(),
        Err(err) => map_err(err).into_response(),
    }
}

pub(crate) async fn submit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((document_type, id)): Path<(String, i64)>,
) -> impl IntoResponse {
    let permission = match document_type.as_str() {
        "customer_order" => Permission::SalesWrite,
        "purchase_order" => Permission::PurchasesWrite,
        _ => return map_err(depotpro_core::CoreError::Validation("Type de document invalide.".into())).into_response(),
    };
    let actor = match require_perm(&state, &headers, permission).await {
        Ok(actor) => actor,
        Err(err) => return err.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, commercial_documents::submit_for_approval(&db, &document_type, id)).await {
        Ok(()) => (StatusCode::ACCEPTED, Json(serde_json::json!({"status":"pending_owner_approval"}))).into_response(),
        Err(err) => map_err(err).into_response(),
    }
}

pub(crate) async fn review(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((document_type, id)): Path<(String, i64)>,
    Json(payload): Json<ReviewDecisionInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ReportsRead).await {
        Ok(actor) => actor,
        Err(err) => return err.into_response(),
    };
    if actor.role != Role::Owner {
        return map_err(depotpro_core::CoreError::Forbidden("Seul le propriétaire peut approuver ou rejeter les documents.".into())).into_response();
    }
    let db = state.db().await;
    match auth::with_actor(actor, commercial_documents::review_document(&db, &document_type, id, payload)).await {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({"status":"updated"}))).into_response(),
        Err(err) => map_err(err).into_response(),
    }
}

pub(crate) async fn events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((document_type, id)): Path<(String, i64)>,
) -> impl IntoResponse {
    let actor = match crate::state::require_auth(&state, &headers).await {
        Ok(actor) => actor,
        Err(err) => return err.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, commercial_documents::approval_events(&db, &document_type, id)).await {
        Ok(rows) => (StatusCode::OK, Json(serde_json::to_value(rows).unwrap())).into_response(),
        Err(err) => map_err(err).into_response(),
    }
}
