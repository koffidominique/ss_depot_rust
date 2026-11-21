// ============================================================================
// Handlers HTTP : Catalogue central V3 & prix de référence
// ============================================================================

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::product_catalogue;
use depotpro_core::CoreError;

use crate::state::{map_err, require_perm, AppState};

pub(crate) async fn product_catalogue_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, product_catalogue::get_catalogue_overview(&db)).await {
        Ok(ov) => (StatusCode::OK, Json(serde_json::to_value(ov).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_catalogue_brand(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<product_catalogue::CreateBrandInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, product_catalogue::create_brand(&db, payload)).await {
        Ok(b) => (StatusCode::CREATED, Json(serde_json::to_value(b).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_catalogue_family(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<product_catalogue::CreateProductFamilyInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        product_catalogue::create_product_family(&db, payload),
    )
    .await
    {
        Ok(f) => (StatusCode::CREATED, Json(serde_json::to_value(f).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_catalogue_unit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<product_catalogue::CreateUnitOfMeasureInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        product_catalogue::create_unit_of_measure(&db, payload),
    )
    .await
    {
        Ok(u) => (StatusCode::CREATED, Json(serde_json::to_value(u).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_catalogue_product_new(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<product_catalogue::CreateCatalogueProductInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        product_catalogue::create_catalogue_product(&db, payload),
    )
    .await
    {
        Ok(p) => (StatusCode::CREATED, Json(serde_json::to_value(p).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_catalogue_products_new(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, async {
        Ok::<_, CoreError>(
            product_catalogue::get_catalogue_overview(&db)
                .await?
                .products,
        )
    })
    .await
    {
        Ok(list) => (StatusCode::OK, Json(serde_json::to_value(list).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn initialize_catalogue(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, product_catalogue::initialize_initial_catalogue(&db)).await {
        Ok(rep) => (StatusCode::OK, Json(serde_json::to_value(rep).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn catalogue_set_product_active(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(product_id): Path<i64>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let is_active = payload
        .get("is_active")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    match auth::with_actor(
        actor.clone(),
        product_catalogue::set_catalogue_product_active(&db, product_id, is_active),
    )
    .await
    {
        Ok(dto) => Json(serde_json::to_value(dto).unwrap()).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn catalogue_set_reference_price(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(product_id): Path<i64>,
    Json(payload): Json<product_catalogue::SetReferencePriceInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let username = actor.username.clone();
    match auth::with_actor(
        actor,
        product_catalogue::set_reference_price(&db, product_id, payload, Some(&username)),
    )
    .await
    {
        Ok(dto) => Json(serde_json::to_value(dto).unwrap()).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn catalogue_reference_price_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(product_id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        product_catalogue::list_reference_price_history(&db, product_id),
    )
    .await
    {
        Ok(list) => Json(serde_json::to_value(list).unwrap()).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
