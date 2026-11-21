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
    let product_id: Option<i64> =
        match sqlx::query_scalar("SELECT product_id FROM product_variants WHERE id = ?")
            .bind(variant_id)
            .fetch_optional(&db.pool)
            .await
        {
            Ok(pid) => pid,
            Err(e) => return map_err(e.into()).into_response(),
        };
    let Some(product_id) = product_id else {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Variante introuvable." })),
        )
            .into_response();
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
    let _actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    if payload.price_xof < 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Le prix doit être >= 0." })),
        )
            .into_response();
    }
    let db = state.db().await;
    let prod_id: Option<i64> =
        match sqlx::query_scalar("SELECT product_id FROM product_variants WHERE id = ?")
            .bind(variant_id)
            .fetch_optional(&db.pool)
            .await
        {
            Ok(pid) => pid,
            Err(e) => return map_err(e.into()).into_response(),
        };
    let Some(prod_id) = prod_id else {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Variante introuvable." })),
        )
            .into_response();
    };
    let price_type = match payload.price_type.trim().to_uppercase().as_str() {
        "PURCHASE" | "RETAIL" | "WHOLESALE" | "SEMI_WHOLESALE" | "UNIT" | "PACKAGE"
        | "MINIMUM_SELLING_PRICE" => payload.price_type.trim().to_uppercase(),
        _ => "RETAIL".to_string(),
    };
    let res = sqlx::query(
        "INSERT INTO price_history (
            product_id, variant_id, supplier_id, price_type, new_retail_price,
            currency, effective_from, reason
         ) VALUES (?, ?, ?, ?, ?, 'FCFA', date('now'), ?)",
    )
    .bind(prod_id)
    .bind(variant_id)
    .bind(payload.supplier_id)
    .bind(&price_type)
    .bind(payload.price_xof)
    .bind(payload.reason.as_deref().unwrap_or("Tarif variante"))
    .execute(&db.pool)
    .await;
    match res {
        Ok(r) => (
            StatusCode::CREATED,
            Json(serde_json::json!({
                "id": r.last_insert_rowid(),
                "product_id": prod_id,
                "variant_id": variant_id,
                "price_type": price_type,
                "price_xof": payload.price_xof,
            })),
        )
            .into_response(),
        Err(e) => map_err(e.into()).into_response(),
    }
}
