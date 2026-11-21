// ============================================================================
// Handlers HTTP : Retours partiels & validation POS / compatibilité
// ============================================================================

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::{partial_returns, sales_validation};
use depotpro_core::CoreError;

use crate::state::{map_err, require_perm, AppState};

// ----------------------------------------------------------------------------
// 1. Retours partiels d'emballages
// ----------------------------------------------------------------------------

pub(crate) async fn partial_returns_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, partial_returns::get_partial_returns_overview(&db)).await {
        Ok(ov) => (StatusCode::OK, Json(serde_json::to_value(ov).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_partial_return(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<partial_returns::CreatePartialReturnInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, partial_returns::create_partial_return(&db, payload)).await {
        Ok(items) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(items).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_pending_partial_returns(
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
            partial_returns::get_partial_returns_overview(&db)
                .await?
                .pending_returns,
        )
    })
    .await
    {
        Ok(list) => (StatusCode::OK, Json(serde_json::to_value(list).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_pending_partial_return(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((client_id, sale_id)): Path<(i64, i64)>,
    Json(total_expected_pieces): Json<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        partial_returns::create_pending_partial_return(
            &db,
            client_id,
            sale_id,
            total_expected_pieces,
        ),
    )
    .await
    {
        Ok(p) => (StatusCode::CREATED, Json(serde_json::to_value(p).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_pending_partial_return(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<partial_returns::UpdatePendingReturnInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, partial_returns::update_pending_return(&db, payload)).await {
        Ok(p) => (StatusCode::OK, Json(serde_json::to_value(p).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

// ----------------------------------------------------------------------------
// 2. Validation POS & règles de compatibilité
// ----------------------------------------------------------------------------

pub(crate) async fn get_pos_validation_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(terminal_id): Path<String>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        sales_validation::get_pos_validation_config(&db, &terminal_id),
    )
    .await
    {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_pos_validation_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<sales_validation::UpdatePosConfigInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SettingsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        sales_validation::update_pos_validation_config(&db, payload),
    )
    .await
    {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn validate_sale_compatibility(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<sales_validation::ValidateSaleInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        sales_validation::validate_sale_compatibility(&db, payload),
    )
    .await
    {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_compatibility_rule(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<sales_validation::CreateCompatibilityRuleInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SettingsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        sales_validation::create_compatibility_rule(&db, payload),
    )
    .await
    {
        Ok(r) => (StatusCode::CREATED, Json(serde_json::to_value(r).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_compatibility_rules(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, sales_validation::get_compatibility_rules(&db)).await {
        Ok(list) => (StatusCode::OK, Json(serde_json::to_value(list).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
