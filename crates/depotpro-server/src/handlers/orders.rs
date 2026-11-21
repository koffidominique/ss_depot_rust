// ============================================================================
// Handlers HTTP : Commandes clientèle mixtes & prévisualisation
// ============================================================================

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::orders;

use crate::state::{map_err, require_perm, AppState};

pub(crate) async fn compose_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<orders::ComposePreviewInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::compose_preview(&db, payload)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_orders(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(filter): Query<orders::OrderListFilter>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::list_orders(&db, filter)).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_order(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<orders::CreateOrderInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::create_order(&db, payload)).await {
        Ok(res) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(res).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn get_order(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::get_order(&db, id)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_order(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<orders::UpdateOrderInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::update_order(&db, id, payload)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn confirm_order(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::confirm_order(&db, id)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn deliver_order(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::deliver_order(&db, id)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn invoice_order(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::invoice_order(&db, id)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn pay_order(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<orders::PayOrderInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::pay_order(&db, id, payload)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn cancel_order(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesCancelReturn).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::cancel_order(&db, id)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn return_order_packaging(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<orders::OrderReturnInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::return_order_packaging(&db, id, payload)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
