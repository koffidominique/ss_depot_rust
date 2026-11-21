// ============================================================================
// Handlers HTTP : Fournisseurs, commandes d'achats & dettes fournisseurs
// ============================================================================

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::purchases;

use crate::dto::SearchQuery;
use crate::state::{map_err, require_perm, AppState};

// ----------------------------------------------------------------------------
// 1. Fournisseurs
// ----------------------------------------------------------------------------

pub(crate) async fn list_suppliers(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::PurchasesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, purchases::list_suppliers(&db, q.search.as_deref())).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_supplier(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<purchases::CreateSupplierInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::PurchasesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, purchases::create_supplier(&db, payload)).await {
        Ok(s) => (StatusCode::CREATED, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_supplier(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<purchases::UpdateSupplierInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::PurchasesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, purchases::update_supplier(&db, id, payload)).await {
        Ok(s) => (StatusCode::OK, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

// ----------------------------------------------------------------------------
// 2. Bons de commande, réceptions & dettes fournisseurs
// ----------------------------------------------------------------------------

pub(crate) async fn list_purchases(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::PurchasesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, purchases::list_purchase_orders(&db)).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_purchase(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<purchases::CreatePurchaseOrderInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::PurchasesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, purchases::create_purchase_order(&db, payload)).await {
        Ok(po) => (StatusCode::CREATED, Json(serde_json::to_value(po).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn receive_purchase(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<purchases::ReceivePurchaseOrderInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::PurchasesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, purchases::receive_purchase_order(&db, id, payload)).await {
        Ok(rec) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(rec).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn cancel_purchase(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<purchases::CancelPurchaseOrderInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::PurchasesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, purchases::cancel_purchase_order(&db, id, payload)).await {
        Ok(po) => (StatusCode::OK, Json(serde_json::to_value(po).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_supplier_debts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::PurchasesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, purchases::list_supplier_debts(&db)).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn pay_supplier_debt(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<purchases::PaySupplierDebtInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SupplierDebtsPay).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, purchases::pay_supplier_debt(&db, id, payload)).await {
        Ok(debt) => (StatusCode::OK, Json(serde_json::to_value(debt).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
