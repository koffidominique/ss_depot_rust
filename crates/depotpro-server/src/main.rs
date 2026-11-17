use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post, put};
use axum::Router;
use serde::Deserialize;
use tokio::sync::RwLock;
use tower_http::services::{ServeDir, ServeFile};
use uuid::Uuid;

use depotpro_core::application::{
    auth, cash, consignments, inventory, pdf, products, purchases, reports, sales,
};
use depotpro_core::infrastructure::{backup, db::DepotDb};
use depotpro_core::CoreError;

#[derive(Default)]
struct AuthRateLimiter {
    buckets: HashMap<String, (u32, Instant)>,
}

impl AuthRateLimiter {
    fn check(&mut self, key: &str, now: Instant) -> bool {
        let window = Duration::from_secs(60);
        let entry = self.buckets.entry(key.to_string()).or_insert((0, now + window));
        if now > entry.1 {
            *entry = (1, now + window);
            return true;
        }
        entry.0 += 1;
        entry.0 <= 25
    }
}

fn is_allowed_origin(origin: &str, host: &str, extra_allowed: &str) -> bool {
    let lower = origin.trim().to_ascii_lowercase();
    let is_local = lower == "http://localhost"
        || lower == "https://localhost"
        || lower.starts_with("http://localhost:")
        || lower.starts_with("https://localhost:")
        || lower == "http://127.0.0.1"
        || lower == "https://127.0.0.1"
        || lower.starts_with("http://127.0.0.1:")
        || lower.starts_with("https://127.0.0.1:");
    let matches_host = !host.is_empty()
        && (origin.starts_with(&format!("http://{host}"))
            || origin.starts_with(&format!("https://{host}")));
    let in_extra = extra_allowed
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .any(|allowed| allowed == origin);
    is_local || matches_host || in_extra
}

#[derive(Clone)]
struct AppState {
    db: Arc<RwLock<DepotDb>>,
    backup_dir: PathBuf,
    tokens: Arc<RwLock<HashSet<String>>>,
    auth_limiter: Arc<RwLock<AuthRateLimiter>>,
}

impl AppState {
    async fn db(&self) -> DepotDb {
        self.db.read().await.clone()
    }
}

#[derive(Deserialize)]
struct PinPayload {
    pin: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangePinPayload {
    current_pin: String,
    new_pin: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchQuery {
    search: Option<String>,
    status: Option<String>,
    from: Option<String>,
    to: Option<String>,
    category_id: Option<i64>,
    include_archived: Option<bool>,
    low_stock_only: Option<bool>,
    page: Option<i64>,
    page_size: Option<i64>,
}

#[derive(Deserialize)]
struct ReportQuery {
    from: Option<String>,
    to: Option<String>,
}

#[derive(Deserialize)]
struct CategoryPayload {
    name: String,
    description: Option<String>,
}

#[derive(Deserialize)]
struct CsvImportPayload {
    csv: String,
}

#[derive(Deserialize)]
struct CreateInventoryPayload {
    notes: Option<String>,
}

#[derive(Deserialize)]
struct ValidateInventoryPayload {
    lines: Vec<inventory::ValidateInventoryLineInput>,
}

#[derive(Deserialize)]
struct AddPaymentMethodPayload {
    label: String,
}

#[derive(Deserialize)]
struct TogglePaymentMethodPayload {
    active: bool,
}

fn map_err(err: CoreError) -> (StatusCode, Json<serde_json::Value>) {
    let status = match err {
        CoreError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
        CoreError::Validation(_)
        | CoreError::InsufficientStock(_)
        | CoreError::CreditPolicyViolation(_)
        | CoreError::SessionNotOpen(_)
        | CoreError::SessionAlreadyOpen(_)
        | CoreError::HistoricalImmutable(_)
        | CoreError::InvalidPayment(_) => StatusCode::BAD_REQUEST,
        CoreError::DuplicateOperation(_) => StatusCode::CONFLICT,
        _ => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (status, Json(serde_json::to_value(err).unwrap_or_default()))
}

fn extract_axum_token(headers: &HeaderMap) -> Option<&str> {
    if let Some(t) = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        return Some(t);
    }
    headers
        .get("x-depotpro-token")
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

async fn require_auth(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    if let Some(t) = extract_axum_token(headers) {
        if state.tokens.read().await.contains(t) {
            return Ok(());
        }
    }
    Err(map_err(CoreError::Unauthorized(
        "Session verrouillée ou expirée.".to_string(),
    )))
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok", "engine": "depotpro-axum" }))
}

async fn auth_status(State(state): State<AppState>) -> impl IntoResponse {
    let db = state.db().await;
    match auth::get_auth_status(&db).await {
        Ok(dto) => (StatusCode::OK, Json(serde_json::to_value(dto).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn auth_setup(
    State(state): State<AppState>,
    Json(payload): Json<PinPayload>,
) -> impl IntoResponse {
    let db = state.db().await;
    match auth::setup_owner_pin(&db, &payload.pin).await {
        Ok(()) => {
            let token = Uuid::new_v4().to_string();
            state.tokens.write().await.insert(token.clone());
            (StatusCode::OK, Json(serde_json::json!({ "token": token }))).into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}

async fn auth_login(
    State(state): State<AppState>,
    Json(payload): Json<PinPayload>,
) -> impl IntoResponse {
    let db = state.db().await;
    match auth::verify_owner_pin(&db, &payload.pin).await {
        Ok(()) => {
            let token = Uuid::new_v4().to_string();
            state.tokens.write().await.insert(token.clone());
            (StatusCode::OK, Json(serde_json::json!({ "token": token }))).into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}

async fn auth_lock(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Some(token) = extract_axum_token(&headers) {
        state.tokens.write().await.remove(token);
    }
    (StatusCode::OK, Json(serde_json::json!({ "locked": true }))).into_response()
}

async fn auth_change_pin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ChangePinPayload>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match auth::change_owner_pin(&db, &payload.current_pin, &payload.new_pin).await {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn dashboard(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match reports::get_dashboard_data(&db).await {
        Ok(data) => (StatusCode::OK, Json(serde_json::to_value(data).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_categories(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match products::list_categories(&db).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_category(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CategoryPayload>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match products::create_category(&db, &payload.name, payload.description.as_deref()).await {
        Ok(cat) => (StatusCode::CREATED, Json(serde_json::to_value(cat).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_products(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(25).clamp(1, 100);
    match products::list_products(
        &db,
        q.search.as_deref(),
        q.category_id,
        q.include_archived.unwrap_or(false),
        q.low_stock_only.unwrap_or(false),
        page,
        page_size,
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_product(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<products::CreateProductInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match products::create_product(&db, payload).await {
        Ok(p) => (StatusCode::CREATED, Json(serde_json::to_value(p).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_product(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<products::UpdateProductInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match products::update_product(&db, id, payload).await {
        Ok(p) => (StatusCode::OK, Json(serde_json::to_value(p).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn upsert_packaging(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<products::PackagingInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match products::upsert_packaging(&db, id, payload).await {
        Ok(pk) => (StatusCode::OK, Json(serde_json::to_value(pk).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn export_products_csv(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match products::export_products_csv(&db).await {
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

async fn import_products_csv(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CsvImportPayload>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match products::import_products_csv(&db, &payload.csv).await {
        Ok(created) => {
            (StatusCode::OK, Json(serde_json::json!({ "created": created }))).into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_clients(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match sales::list_clients(&db, q.search.as_deref()).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_client(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<sales::CreateClientInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match sales::create_client(&db, payload).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_client(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<sales::UpdateClientInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match sales::update_client(&db, id, payload).await {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_client_credit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<sales::UpdateCreditPolicyInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match sales::update_client_credit_policy(&db, id, payload).await {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_sales(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(25).clamp(1, 100);
    match sales::list_sales(
        &db,
        q.search.as_deref(),
        q.status.as_deref(),
        q.from.as_deref(),
        q.to.as_deref(),
        page_size,
        (page - 1) * page_size,
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn get_sale(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match sales::get_sale_detail(&db, id).await {
        Ok(s) => (StatusCode::OK, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_sale(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<sales::CreateSaleInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match sales::create_sale(&db, payload).await {
        Ok(s) => (StatusCode::CREATED, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn cancel_sale(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<sales::CancelSaleInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match sales::cancel_sale(&db, id, payload).await {
        Ok(s) => (StatusCode::OK, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn return_sale(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<sales::CreateSaleReturnInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match sales::create_sale_return(&db, id, payload).await {
        Ok(s) => (StatusCode::CREATED, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn stock_overview(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match inventory::get_stock_overview(&db).await {
        Ok(ov) => (StatusCode::OK, Json(serde_json::to_value(ov).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn adjust_stock(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<inventory::AdjustStockInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match inventory::adjust_stock(&db, payload).await {
        Ok(mv) => (StatusCode::CREATED, Json(serde_json::to_value(mv).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_inventories(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match inventory::list_inventories(&db).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_inventory(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateInventoryPayload>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match inventory::create_inventory(&db, payload.notes.as_deref()).await {
        Ok(inv) => (StatusCode::CREATED, Json(serde_json::to_value(inv).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn validate_inventory(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<ValidateInventoryPayload>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match inventory::validate_inventory(&db, id, payload.lines).await {
        Ok(inv) => (StatusCode::OK, Json(serde_json::to_value(inv).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn cash_status(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match cash::get_cash_status(&db).await {
        Ok(s) => (StatusCode::OK, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn open_cash(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<cash::OpenCashInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match cash::open_cash_session(&db, payload).await {
        Ok(s) => (StatusCode::CREATED, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn close_cash(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<cash::CloseCashInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match cash::close_cash_session(&db, payload).await {
        Ok(s) => (StatusCode::OK, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_receivables(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match cash::list_receivables(&db).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn pay_receivable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<cash::PayReceivableInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match cash::pay_receivable(&db, id, payload).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_expenses(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match cash::list_expenses(&db).await {
        Ok(ov) => (StatusCode::OK, Json(serde_json::to_value(ov).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_expense(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<cash::CreateExpenseInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match cash::create_expense(&db, payload).await {
        Ok(()) => (StatusCode::CREATED, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_suppliers(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match purchases::list_suppliers(&db, q.search.as_deref()).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_supplier(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<purchases::CreateSupplierInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match purchases::create_supplier(&db, payload).await {
        Ok(s) => (StatusCode::CREATED, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_supplier(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<purchases::UpdateSupplierInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match purchases::update_supplier(&db, id, payload).await {
        Ok(s) => (StatusCode::OK, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_purchases(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match purchases::list_purchase_orders(&db).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_purchase(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<purchases::CreatePurchaseOrderInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match purchases::create_purchase_order(&db, payload).await {
        Ok(po) => (StatusCode::CREATED, Json(serde_json::to_value(po).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn receive_purchase(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<purchases::ReceivePurchaseOrderInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match purchases::receive_purchase_order(&db, id, payload).await {
        Ok(rec) => (StatusCode::CREATED, Json(serde_json::to_value(rec).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn cancel_purchase(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<purchases::CancelPurchaseOrderInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match purchases::cancel_purchase_order(&db, id, payload).await {
        Ok(po) => (StatusCode::OK, Json(serde_json::to_value(po).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_supplier_debts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match purchases::list_supplier_debts(&db).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn pay_supplier_debt(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<purchases::PaySupplierDebtInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match purchases::pay_supplier_debt(&db, id, payload).await {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn consignments_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match consignments::get_overview(&db).await {
        Ok(ov) => (StatusCode::OK, Json(serde_json::to_value(ov).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_returnable_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<consignments::CreateReturnableTypeInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match consignments::create_returnable_type(&db, payload).await {
        Ok(t) => (StatusCode::CREATED, Json(serde_json::to_value(t).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn adjust_returnable_stock(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<consignments::AdjustReturnableStockInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match consignments::adjust_returnable_stock(&db, payload).await {
        Ok(()) => (StatusCode::CREATED, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn return_client_empties(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<consignments::ReturnClientEmptiesInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match consignments::return_client_empties(&db, payload).await {
        Ok(reference) => (
            StatusCode::CREATED,
            Json(serde_json::json!({ "reference": reference })),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn reports_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ReportQuery>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match reports::get_reports_overview(&db, q.from.as_deref(), q.to.as_deref()).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn get_settings(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match reports::get_settings_bundle(&db).await {
        Ok(bundle) => (StatusCode::OK, Json(serde_json::to_value(bundle).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<reports::UpdateSettingsInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match reports::update_settings(&db, payload).await {
        Ok(bundle) => (StatusCode::OK, Json(serde_json::to_value(bundle).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn add_payment_method(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AddPaymentMethodPayload>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match reports::add_payment_method(&db, &payload.label).await {
        Ok(pm) => (StatusCode::CREATED, Json(serde_json::to_value(pm).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn toggle_payment_method(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(code): Path<String>,
    Json(payload): Json<TogglePaymentMethodPayload>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match reports::toggle_payment_method(&db, &code, payload.active).await {
        Ok(pm) => (StatusCode::OK, Json(serde_json::to_value(pm).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn generate_document_pdf(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<pdf::DocumentPdfInput>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match pdf::generate_document_pdf(&db, payload).await {
        Ok((filename, bytes)) => {
            let disp = format!("attachment; filename=\"{filename}\"");
            let mut resp_headers = HeaderMap::new();
            resp_headers.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/pdf"),
            );
            if let Ok(val) = HeaderValue::from_str(&disp) {
                resp_headers.insert(header::CONTENT_DISPOSITION, val);
            }
            (StatusCode::OK, resp_headers, bytes).into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_backups(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match backup::list_backups(&state.backup_dir) {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_backup(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    let db = state.db().await;
    match backup::create_backup_summary(&db, &state.backup_dir).await {
        Ok(summary) => {
            (StatusCode::CREATED, Json(serde_json::to_value(summary).unwrap())).into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}

async fn verify_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match backup::verify_backup(&state.backup_dir, &name).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn download_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match backup::read_backup_bytes(&state.backup_dir, &name) {
        Ok((safe_name, bytes)) => {
            let disp = format!("attachment; filename=\"{safe_name}\"");
            let mut resp_headers = HeaderMap::new();
            resp_headers.insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/octet-stream"),
            );
            if let Ok(val) = HeaderValue::from_str(&disp) {
                resp_headers.insert(header::CONTENT_DISPOSITION, val);
            }
            (StatusCode::OK, resp_headers, bytes).into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}

async fn restore_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match backup::restore_and_reconnect(&state.db, &state.backup_dir, &name).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn security_middleware(
    State(state): State<AppState>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().clone();
    let is_mutating = matches!(
        method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    );

    if is_mutating {
        if let Some(origin) = req.headers().get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
            let host = req
                .headers()
                .get(header::HOST)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            let extra = std::env::var("DEPOTPRO_ALLOWED_ORIGINS").unwrap_or_default();
            if !is_allowed_origin(origin, host, &extra) {
                let mut resp = (
                    StatusCode::FORBIDDEN,
                    Json(serde_json::json!({
                        "code": "FORBIDDEN_ORIGIN",
                        "message": "Origine requête non autorisée."
                    })),
                )
                    .into_response();
                apply_security_headers(resp.headers_mut(), &path);
                return resp;
            }
        }
    }

    if path == "/api/auth/setup" || path == "/api/auth/login" || path == "/api/auth/change-pin" {
        let client_ip = req
            .headers()
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("local");
        let client_key = format!("{client_ip}:{path}");
        let allowed = state
            .auth_limiter
            .write()
            .await
            .check(&client_key, Instant::now());
        if !allowed {
            let mut resp = (
                StatusCode::TOO_MANY_REQUESTS,
                Json(serde_json::json!({
                    "code": "RATE_LIMITED",
                    "message": "Trop de requêtes d’authentification. Patientez une minute."
                })),
            )
                .into_response();
            apply_security_headers(resp.headers_mut(), &path);
            return resp;
        }
    }

    let mut resp = next.run(req).await;
    apply_security_headers(resp.headers_mut(), &path);
    resp
}

fn apply_security_headers(headers: &mut HeaderMap, path: &str) {
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("SAMEORIGIN"));
    headers.insert(header::REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    if path.starts_with("/api") {
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let db_path = std::env::var("DEPOTPRO_DB_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./data/depotpro_v3.db"));
    let backup_dir = std::env::var("DEPOTPRO_BACKUP_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./data/Sauvegardes"));

    let db = DepotDb::connect(&db_path)
        .await
        .expect("Impossible de connecter SQLite via SQLx");

    let state = AppState {
        db: Arc::new(RwLock::new(db)),
        backup_dir,
        tokens: Arc::new(RwLock::new(HashSet::new())),
        auth_limiter: Arc::new(RwLock::new(AuthRateLimiter::default())),
    };

    let mut app = Router::new()
        .route("/api/health", get(health))
        .route("/api/auth/status", get(auth_status))
        .route("/api/auth/setup", post(auth_setup))
        .route("/api/auth/login", post(auth_login))
        .route("/api/auth/lock", post(auth_lock))
        .route("/api/auth/change-pin", post(auth_change_pin))
        .route("/api/dashboard", get(dashboard))
        .route("/api/categories", get(list_categories).post(create_category))
        .route("/api/products", get(list_products).post(create_product))
        .route("/api/products/:id", put(update_product))
        .route("/api/products/:id/packagings", post(upsert_packaging))
        .route("/api/products/export/csv", get(export_products_csv))
        .route("/api/products/import/csv", post(import_products_csv))
        .route("/api/clients", get(list_clients).post(create_client))
        .route("/api/clients/:id", put(update_client))
        .route("/api/clients/:id/credit", put(update_client_credit))
        .route("/api/sales", get(list_sales).post(create_sale))
        .route("/api/sales/:id", get(get_sale))
        .route("/api/sales/:id/cancel", post(cancel_sale))
        .route("/api/sales/:id/returns", post(return_sale))
        .route("/api/receivables", get(list_receivables))
        .route("/api/receivables/:id/pay", post(pay_receivable))
        .route("/api/suppliers", get(list_suppliers).post(create_supplier))
        .route("/api/suppliers/:id", put(update_supplier))
        .route("/api/purchases", get(list_purchases).post(create_purchase))
        .route("/api/purchases/:id/receive", post(receive_purchase))
        .route("/api/purchases/:id/cancel", post(cancel_purchase))
        .route("/api/supplier-debts", get(list_supplier_debts))
        .route("/api/supplier-debts/:id/pay", post(pay_supplier_debt))
        .route("/api/stock", get(stock_overview))
        .route("/api/stock/adjust", post(adjust_stock))
        .route("/api/inventories", get(list_inventories).post(create_inventory))
        .route("/api/inventories/:id/validate", post(validate_inventory))
        .route("/api/consignments", get(consignments_overview))
        .route("/api/consignments/types", post(create_returnable_type))
        .route(
            "/api/consignments/stock-movements",
            post(adjust_returnable_stock),
        )
        .route("/api/consignments/returns", post(return_client_empties))
        .route("/api/cash", get(cash_status))
        .route("/api/cash/open", post(open_cash))
        .route("/api/cash/close", post(close_cash))
        .route("/api/expenses", get(list_expenses).post(create_expense))
        .route("/api/reports", get(reports_overview))
        .route("/api/documents/pdf", post(generate_document_pdf))
        .route("/api/settings", get(get_settings).put(update_settings))
        .route("/api/payment-methods", post(add_payment_method))
        .route("/api/payment-methods/:code", put(toggle_payment_method))
        .route("/api/backups", get(list_backups).post(create_backup))
        .route("/api/backups/:name/verify", get(verify_backup))
        .route("/api/backups/:name/download", get(download_backup))
        .route("/api/backups/:name/restore", post(restore_backup))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            security_middleware,
        ))
        .with_state(state);

    let dist_dir = PathBuf::from("./dist");
    if dist_dir.exists() {
        let index_file = dist_dir.join("index.html");
        app = app.fallback_service(
            ServeDir::new(&dist_dir).not_found_service(ServeFile::new(index_file)),
        );
    }

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);
    let host: IpAddr = std::env::var("DEPOTPRO_HOST")
        .ok()
        .and_then(|h| h.parse().ok())
        .unwrap_or_else(|| IpAddr::from([127, 0, 0, 1]));
    let addr = SocketAddr::from((host, port));
    tracing::info!("DEPOTPRO Axum server listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_allowlist_blocks_foreign_domains_and_accepts_localhost() {
        assert!(is_allowed_origin("http://localhost:3000", "127.0.0.1:3000", ""));
        assert!(is_allowed_origin("http://127.0.0.1:3100", "127.0.0.1:3000", ""));
        assert!(!is_allowed_origin("https://evil.example", "127.0.0.1:3000", ""));
        assert!(is_allowed_origin(
            "https://preview.depotpro.local",
            "127.0.0.1:3000",
            "https://preview.depotpro.local"
        ));
    }

    #[test]
    fn auth_rate_limiter_enforces_window_and_resets() {
        let mut limiter = AuthRateLimiter::default();
        let t0 = Instant::now();
        for _ in 0..25 {
            assert!(limiter.check("local", t0));
        }
        assert!(!limiter.check("local", t0));
        assert!(limiter.check("local", t0 + Duration::from_secs(61)));
    }
}
