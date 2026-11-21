// ============================================================================
// Handlers HTTP : Variantes produits, tarifs fournisseurs & listes clients
// ============================================================================

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::catalogue;

use crate::dto::SearchQuery;
use crate::state::{map_err, require_perm, AppState};

// ----------------------------------------------------------------------------
// 1. Variantes produits
// ----------------------------------------------------------------------------

pub(crate) async fn list_product_variants(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
    Query(prod_q): Query<catalogue::PaginatedQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let product_id = q.search.as_deref().and_then(|s| s.parse::<i64>().ok());
    let cq = catalogue::PaginatedQuery {
        page: prod_q.page,
        page_size: prod_q.page_size,
        search: prod_q.search,
        include_archived: prod_q.include_archived,
    };
    match auth::with_actor(actor, catalogue::list_product_variants(&db, cq, product_id)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_product_variant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateProductVariantInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_product_variant(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_product_variant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateProductVariantInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::update_product_variant(&db, id, payload)).await {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn delete_product_variant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_product_variant(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

// ----------------------------------------------------------------------------
// 2. Prix fournisseurs
// ----------------------------------------------------------------------------

pub(crate) async fn list_supplier_prices(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
    Query(sup_q): Query<catalogue::PaginatedQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let supplier_id = q.search.as_deref().and_then(|s| s.parse::<i64>().ok());
    let cq = catalogue::PaginatedQuery {
        page: sup_q.page,
        page_size: sup_q.page_size,
        search: sup_q.search,
        include_archived: sup_q.include_archived,
    };
    match auth::with_actor(
        actor,
        catalogue::list_supplier_prices(&db, cq, supplier_id, None),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_supplier_price(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateSupplierProductPriceInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_supplier_price(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_supplier_price(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateSupplierProductPriceInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::update_supplier_price(&db, id, payload)).await {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn delete_supplier_price(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_supplier_price(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

// ----------------------------------------------------------------------------
// 3. Listes tarifaires clients
// ----------------------------------------------------------------------------

pub(crate) async fn list_customer_price_lists(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::list_customer_price_lists(&db, q.into())).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_customer_price_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateCustomerPriceListInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_customer_price_list(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_customer_price_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateCustomerPriceListInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        catalogue::update_customer_price_list(&db, id, payload),
    )
    .await
    {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn delete_customer_price_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_customer_price_list(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
