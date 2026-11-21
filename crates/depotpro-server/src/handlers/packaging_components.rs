// ============================================================================
// Handlers HTTP : Emballages composants, assemblage & profils bouteilles/casiers
// ============================================================================

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::packaging_components;
use depotpro_core::CoreError;

use crate::state::{map_err, require_perm, AppState};

pub(crate) async fn packaging_components_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, packaging_components::get_components_overview(&db)).await {
        Ok(ov) => (StatusCode::OK, Json(serde_json::to_value(ov).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_crate_components(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, async {
        Ok::<_, CoreError>(
            packaging_components::get_components_overview(&db)
                .await?
                .crate_components,
        )
    })
    .await
    {
        Ok(list) => (StatusCode::OK, Json(serde_json::to_value(list).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_crate_component(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<packaging_components::CreateCrateComponentInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        packaging_components::create_crate_component(&db, payload),
    )
    .await
    {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn packaging_stock_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, async {
        Ok::<_, CoreError>(
            packaging_components::get_components_overview(&db)
                .await?
                .component_stock,
        )
    })
    .await
    {
        Ok(list) => (StatusCode::OK, Json(serde_json::to_value(list).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_component_stock(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<packaging_components::UpdateComponentStockInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        packaging_components::update_component_stock(&db, payload),
    )
    .await
    {
        Ok(mv) => (StatusCode::CREATED, Json(serde_json::to_value(mv).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn assemble_crates(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<packaging_components::AssembleCratesInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, packaging_components::assemble_crates(&db, payload)).await {
        Ok(rec) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(rec).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn disassemble_crates(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<packaging_components::DisassembleCratesInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        packaging_components::disassemble_crates(&db, payload),
    )
    .await
    {
        Ok(rec) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(rec).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_bottle_profiles_pc(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        packaging_components::get_bottle_profiles_by_material(&db, "glass".into()),
    )
    .await
    {
        Ok(list) => (StatusCode::OK, Json(serde_json::to_value(list).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_bottle_profile_pc(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<packaging_components::CreateBottleProfileInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        packaging_components::create_bottle_profile(&db, payload),
    )
    .await
    {
        Ok(p) => (StatusCode::CREATED, Json(serde_json::to_value(p).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_crate_types_pc(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, async {
        Ok::<_, CoreError>(packaging_components::get_crate_types(&db, true).await)
    })
    .await
    {
        Ok(list) => (StatusCode::OK, Json(serde_json::to_value(list).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_crate_type_pc(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<packaging_components::CreateCrateTypeInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, packaging_components::create_crate_type(&db, payload)).await {
        Ok(t) => (StatusCode::CREATED, Json(serde_json::to_value(t).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
