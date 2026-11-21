// ============================================================================
// Handlers HTTP : Catégories, produits, conditionnements & CSV
// ============================================================================

use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Json};

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::products;

use crate::dto::{CategoryPayload, CsvImportPayload, SearchQuery};
use crate::state::{map_err, require_perm, AppState};

pub(crate) async fn list_categories(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, products::list_categories(&db)).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_category(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CategoryPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        products::create_category(&db, &payload.name, payload.description.as_deref()),
    )
    .await
    {
        Ok(cat) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(cat).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn list_products(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(25).clamp(1, 100);
    match auth::with_actor(
        actor,
        products::list_products(
            &db,
            q.search.as_deref(),
            q.category_id,
            q.include_archived.unwrap_or(false),
            q.low_stock_only.unwrap_or(false),
            page,
            page_size,
        ),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn create_product(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<products::CreateProductInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, products::create_product(&db, payload)).await {
        Ok(p) => (StatusCode::CREATED, Json(serde_json::to_value(p).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn update_product(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<products::UpdateProductInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, products::update_product(&db, id, payload)).await {
        Ok(p) => (StatusCode::OK, Json(serde_json::to_value(p).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn upsert_packaging(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<products::PackagingInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, products::upsert_packaging(&db, id, payload)).await {
        Ok(pk) => (StatusCode::OK, Json(serde_json::to_value(pk).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn export_products_csv(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, products::export_products_csv(&db)).await {
        Ok(csv) => (
            StatusCode::OK,
            [
                (
                    header::CONTENT_TYPE,
                    HeaderValue::from_static("text/csv; charset=utf-8"),
                ),
                (
                    header::CONTENT_DISPOSITION,
                    HeaderValue::from_static("attachment; filename=\"depotpro_produits.csv\""),
                ),
            ],
            csv,
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

pub(crate) async fn import_products_csv(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CsvImportPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, products::import_products_csv(&db, &payload.csv)).await {
        Ok(created) => (
            StatusCode::OK,
            Json(serde_json::json!({ "created": created })),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}
