// ============================================================================
// Handlers HTTP : Consignations, retours d'emballages & obligations financières
// ============================================================================

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::{consignments, packaging_obligations};

use crate::dto::PackagingObligationsQuery;
use crate::state::{map_err, require_perm, AppState};

pub(crate) async fn consignments_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, consignments::get_overview(&db)).await {
        Ok(ov) => (StatusCode::OK, Json(serde_json::to_value(ov).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_returnable_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<consignments::CreateReturnableTypeInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, consignments::create_returnable_type(&db, payload)).await {
        Ok(t) => (StatusCode::CREATED, Json(serde_json::to_value(t).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn adjust_returnable_stock(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<consignments::AdjustReturnableStockInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, consignments::adjust_returnable_stock(&db, payload)).await {
        Ok(mv) => (StatusCode::CREATED, Json(serde_json::to_value(mv).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn return_client_empties(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<consignments::ReturnClientEmptiesInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, consignments::return_client_empties(&db, payload)).await {
        Ok(ret) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(ret).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn packaging_obligations_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<PackagingObligationsQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        packaging_obligations::list_obligations(&db, q.client_id),
    )
    .await
    {
        Ok(list) => Json(serde_json::to_value(list).unwrap()).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn packaging_dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(client_id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ConsignmentsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        packaging_obligations::get_client_packaging_dashboard(&db, client_id),
    )
    .await
    {
        Ok(dto) => Json(serde_json::to_value(dto).unwrap()).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn packaging_pay_debt(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<packaging_obligations::PayPackagingDebtInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ReceivablesPay).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor.clone(),
        packaging_obligations::pay_packaging_financial_debt(&db, payload, Some(&actor.username)),
    )
    .await
    {
        Ok(dto) => Json(serde_json::to_value(dto).unwrap()).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
