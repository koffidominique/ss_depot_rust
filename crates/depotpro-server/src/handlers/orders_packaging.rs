// ============================================================================
// Handlers HTTP : Actifs d'emballage, soldes client & sous-routes variantes
// ============================================================================

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};
use serde::Deserialize;

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::{orders, products};

use crate::dto::PackagingV4Payload;
use crate::state::{map_err, require_perm, AppState};

pub(crate) async fn list_packaging_assets(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::list_packaging_assets(&db)).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn get_packaging_stock(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::StockRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::get_packaging_stock(&db)).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn get_customer_deposits(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::get_customer_deposits(&db, id)).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn get_customer_deposit_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, orders::get_customer_deposit_history(&db, id)).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn return_customer_deposits(
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
    match auth::with_actor(actor, orders::return_customer_deposits(&db, id, payload)).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn add_variant_packaging(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(variant_id): Path<i64>,
    Json(mut payload): Json<PackagingV4Payload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let product_id = match orders::get_variant_product_id(&db, variant_id).await {
        Ok(pid) => pid,
        Err(e) => return map_err(e).into_response(),
    };
    payload.extras.variant_id = Some(variant_id);
    match auth::with_actor(
        actor,
        products::upsert_packaging_v4(&db, product_id, payload.base, payload.extras),
    )
    .await
    {
        Ok(pk) => (StatusCode::CREATED, Json(serde_json::to_value(pk).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

#[derive(Deserialize)]
pub(crate) struct VariantPriceInput {
    pub price_type: String,
    pub price_xof: i64,
    pub supplier_id: Option<i64>,
    pub reason: Option<String>,
}

pub(crate) async fn add_variant_price(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(variant_id): Path<i64>,
    Json(payload): Json<VariantPriceInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        orders::add_variant_price(
            &db,
            variant_id,
            &payload.price_type,
            payload.price_xof,
            payload.supplier_id,
            payload.reason.as_deref(),
        ),
    )
    .await
    {
        Ok(res) => (StatusCode::CREATED, Json(res)).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
