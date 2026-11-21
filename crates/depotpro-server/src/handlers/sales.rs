// ============================================================================
// Handlers HTTP : Clients, ventes, annulations & retours
// ============================================================================

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::sales;

use crate::dto::SearchQuery;
use crate::state::{map_err, require_perm, AppState};

// ----------------------------------------------------------------------------
// 1. Gestion des clients & politique de crédit
// ----------------------------------------------------------------------------

pub(crate) async fn list_clients(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, sales::list_clients(&db, q.search.as_deref())).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_client(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<sales::CreateClientInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, sales::create_client(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_client(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<sales::UpdateClientInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, sales::update_client(&db, id, payload)).await {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_client_credit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<sales::UpdateCreditPolicyInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, sales::update_client_credit_policy(&db, id, payload)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

// ----------------------------------------------------------------------------
// 2. Ventes, détails, annulations & retours
// ----------------------------------------------------------------------------

pub(crate) async fn list_sales(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(25).clamp(1, 100);
    match auth::with_actor(
        actor,
        sales::list_sales(
            &db,
            q.search.as_deref(),
            q.status.as_deref(),
            q.from.as_deref(),
            q.to.as_deref(),
            page_size,
            (page - 1) * page_size,
        ),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn get_sale(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, sales::get_sale_detail(&db, id)).await {
        Ok(s) => (StatusCode::OK, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_sale(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<sales::CreateSaleV4Input>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, sales::create_sale_v4(&db, payload)).await {
        Ok(s) => (StatusCode::CREATED, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn cancel_sale(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<sales::CancelSaleInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesCancelReturn).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, sales::cancel_sale(&db, id, payload)).await {
        Ok(s) => (StatusCode::OK, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn return_sale(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<sales::CreateSaleReturnInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesCancelReturn).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, sales::create_sale_return(&db, id, payload)).await {
        Ok(s) => (StatusCode::CREATED, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
