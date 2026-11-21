// ============================================================================
// Handlers HTTP : Stock, ajustements et inventaires physiques
// ============================================================================

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::inventory;

use crate::dto::{CreateInventoryPayload, ValidateInventoryPayload};
use crate::state::{map_err, require_perm, AppState};

pub(crate) async fn stock_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::StockRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, inventory::get_stock_overview(&db)).await {
        Ok(ov) => (StatusCode::OK, Json(serde_json::to_value(ov).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn adjust_stock(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<inventory::AdjustStockInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::StockAdjust).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, inventory::adjust_stock(&db, payload)).await {
        Ok(mv) => (StatusCode::CREATED, Json(serde_json::to_value(mv).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_inventories(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::StockRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, inventory::list_inventories(&db)).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_inventory(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateInventoryPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::InventoryValidate).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        inventory::create_inventory(&db, payload.notes.as_deref()),
    )
    .await
    {
        Ok(inv) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(inv).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn validate_inventory(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<ValidateInventoryPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::InventoryValidate).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, inventory::validate_inventory(&db, id, payload.lines)).await {
        Ok(inv) => (StatusCode::OK, Json(serde_json::to_value(inv).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
