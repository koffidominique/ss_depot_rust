// ============================================================================
// Handlers Axum : archive des reçus, factures et bons de commande
// ============================================================================

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::documents;

use crate::state::{map_err, require_perm, AppState};

pub(crate) async fn list_document_archive(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(filter): Query<documents::DocumentArchiveFilter>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesRead).await {
        Ok(actor) => actor,
        Err(error) => return error.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, documents::list_document_archive(&db, filter)).await {
        Ok(result) => (StatusCode::OK, Json(serde_json::to_value(result).unwrap())).into_response(),
        Err(error) => map_err(error).into_response(),
    }
}

pub(crate) async fn get_document_archive(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesRead).await {
        Ok(actor) => actor,
        Err(error) => return error.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, documents::get_document_archive(&db, id)).await {
        Ok(result) => (StatusCode::OK, Json(serde_json::to_value(result).unwrap())).into_response(),
        Err(error) => map_err(error).into_response(),
    }
}

pub(crate) async fn archive_sale_document(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesWrite).await {
        Ok(actor) => actor,
        Err(error) => return error.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, documents::archive_sale_document(&db, id)).await {
        Ok(result) => (StatusCode::CREATED, Json(serde_json::to_value(result).unwrap())).into_response(),
        Err(error) => map_err(error).into_response(),
    }
}

pub(crate) async fn archive_order_document(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesWrite).await {
        Ok(actor) => actor,
        Err(error) => return error.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, documents::archive_order_document(&db, id)).await {
        Ok(result) => (StatusCode::CREATED, Json(serde_json::to_value(result).unwrap())).into_response(),
        Err(error) => map_err(error).into_response(),
    }
}
