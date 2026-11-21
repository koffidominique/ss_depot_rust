// ============================================================================
// Handlers HTTP : Lignes tarifaires clients, valeurs emballages & historique
// ============================================================================

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::catalogue;

use crate::dto::SearchQuery;
use crate::state::{map_err, require_perm, AppState};

// ----------------------------------------------------------------------------
// 1. Lignes des listes tarifaires clients
// ----------------------------------------------------------------------------

pub(crate) async fn list_customer_price_list_items(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
    Query(pl_q): Query<catalogue::PaginatedQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let price_list_id = q.search.as_deref().and_then(|s| s.parse::<i64>().ok());
    let cq = catalogue::PaginatedQuery {
        page: pl_q.page,
        page_size: pl_q.page_size,
        search: pl_q.search,
        include_archived: pl_q.include_archived,
    };
    match auth::with_actor(
        actor,
        catalogue::list_customer_price_list_items(&db, cq, price_list_id, None),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_customer_price_list_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateCustomerPriceListItemInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        catalogue::create_customer_price_list_item(&db, payload),
    )
    .await
    {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_customer_price_list_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateCustomerPriceListItemInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        catalogue::update_customer_price_list_item(&db, id, payload),
    )
    .await
    {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn delete_customer_price_list_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_customer_price_list_item(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

// ----------------------------------------------------------------------------
// 2. Valeurs de consignation d'emballages & historique des prix
// ----------------------------------------------------------------------------

pub(crate) async fn list_packaging_values(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
    Query(pv_q): Query<catalogue::PaginatedQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let returnable_id = q.search.as_deref().and_then(|s| s.parse::<i64>().ok());
    let cq = catalogue::PaginatedQuery {
        page: pv_q.page,
        page_size: pv_q.page_size,
        search: pv_q.search,
        include_archived: pv_q.include_archived,
    };
    match auth::with_actor(
        actor,
        catalogue::list_packaging_values(&db, cq, returnable_id),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_packaging_value(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreatePackagingValueInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_packaging_value(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_packaging_value(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdatePackagingValueInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::update_packaging_value(&db, id, payload)).await {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn delete_packaging_value(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_packaging_value(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_price_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
    Query(ph_q): Query<catalogue::PaginatedQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let entity_type = q.search.as_deref().map(|s| s.to_string());
    let entity_id = q.search.as_deref().and_then(|s| s.parse::<i64>().ok());
    let cq = catalogue::PaginatedQuery {
        page: ph_q.page,
        page_size: ph_q.page_size,
        search: ph_q.search,
        include_archived: ph_q.include_archived,
    };
    match auth::with_actor(
        actor,
        catalogue::list_price_history(&db, cq, entity_type, entity_id),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
