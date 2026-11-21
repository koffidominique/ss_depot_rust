// ============================================================================
// Handlers HTTP : Catalogue (marques, profils bouteilles, casiers, groupes)
// ============================================================================

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::catalogue;

use crate::dto::SearchQuery;
use crate::state::{map_err, require_perm, AppState};

// ----------------------------------------------------------------------------
// 1. Marques
// ----------------------------------------------------------------------------

pub(crate) async fn list_brands(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::list_brand(&db, q.into())).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_brand(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateBrandInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_brand(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_brand(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateBrandInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::update_brand(&db, id, payload)).await {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn delete_brand(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_brand(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

// ----------------------------------------------------------------------------
// 2. Profils de bouteilles et types de casiers
// ----------------------------------------------------------------------------

pub(crate) async fn update_bottle_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateBottleProfileInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::update_bottle_profile(&db, id, payload)).await {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn delete_bottle_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_bottle_profile(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_crate_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateCrateTypeInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::update_crate_type(&db, id, payload)).await {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn delete_crate_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_crate_type(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

// ----------------------------------------------------------------------------
// 3. Groupes de compatibilité
// ----------------------------------------------------------------------------

pub(crate) async fn list_compatibility_groups(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::list_compatibility_group(&db, q.into())).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_compatibility_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateCompatibilityGroupInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_compatibility_group(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_compatibility_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateCompatibilityGroupInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        catalogue::update_compatibility_group(&db, id, payload),
    )
    .await
    {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn delete_compatibility_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_compatibility_group(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
