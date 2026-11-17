use std::collections::HashSet;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};
use axum::routing::{get, post, put};
use axum::Router;
use serde::Deserialize;
use tokio::sync::RwLock;
use tower_http::services::ServeDir;
use uuid::Uuid;

use depotpro_core::application::{
    auth, cash, consignments, inventory, products, purchases, reports, sales,
};
use depotpro_core::infrastructure::{backup, db::DepotDb};
use depotpro_core::CoreError;

#[derive(Clone)]
struct AppState {
    db: DepotDb,
    backup_dir: PathBuf,
    tokens: Arc<RwLock<HashSet<String>>>,
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

async fn require_auth(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "));
    if let Some(t) = token {
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
    match auth::get_auth_status(&state.db).await {
        Ok(dto) => (StatusCode::OK, Json(serde_json::to_value(dto).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn auth_setup(
    State(state): State<AppState>,
    Json(payload): Json<PinPayload>,
) -> impl IntoResponse {
    match auth::setup_owner_pin(&state.db, &payload.pin).await {
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
    match auth::verify_owner_pin(&state.db, &payload.pin).await {
        Ok(()) => {
            let token = Uuid::new_v4().to_string();
            state.tokens.write().await.insert(token.clone());
            (StatusCode::OK, Json(serde_json::json!({ "token": token }))).into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}

async fn auth_lock(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Some(token) = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
    {
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
    match auth::change_owner_pin(&state.db, &payload.current_pin, &payload.new_pin).await {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn dashboard(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match reports::get_dashboard_kpis(&state.db).await {
        Ok(kpis) => (StatusCode::OK, Json(serde_json::json!({ "kpis": kpis }))).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_categories(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match products::list_categories(&state.db).await {
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
    match products::create_category(&state.db, &payload.name, payload.description.as_deref()).await
    {
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
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(25).clamp(1, 100);
    match products::list_products(
        &state.db,
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
    match products::create_product(&state.db, payload).await {
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
    match products::update_product(&state.db, id, payload).await {
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
    match products::upsert_packaging(&state.db, id, payload).await {
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
    match products::export_products_csv(&state.db).await {
        Ok(csv) => (StatusCode::OK, csv).into_response(),
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
    match products::import_products_csv(&state.db, &payload.csv).await {
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
    match sales::list_clients(&state.db, q.search.as_deref()).await {
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
    match sales::create_client(&state.db, payload).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
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
    match sales::update_client_credit_policy(&state.db, id, payload).await {
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
    let page = q.page.unwrap_or(1).max(1);
    let page_size = q.page_size.unwrap_or(25).clamp(1, 100);
    match sales::list_sales(
        &state.db,
        q.search.as_deref(),
        q.status.as_deref(),
        page_size,
        (page - 1) * page_size,
    )
    .await
    {
        Ok(items) => (
            StatusCode::OK,
            Json(serde_json::json!({ "items": items, "page": page, "pageSize": page_size })),
        )
            .into_response(),
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
    match sales::get_sale_detail(&state.db, id).await {
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
    match sales::create_sale(&state.db, payload).await {
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
    match sales::cancel_sale(&state.db, id, payload).await {
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
    match sales::create_sale_return(&state.db, id, payload).await {
        Ok(s) => (StatusCode::CREATED, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn stock_overview(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match inventory::get_stock_overview(&state.db).await {
        Ok(ov) => (StatusCode::OK, Json(serde_json::to_value(ov).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_inventories(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match inventory::list_inventories(&state.db).await {
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
    match inventory::create_inventory(&state.db, payload.notes.as_deref()).await {
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
    match inventory::validate_inventory(&state.db, id, payload.lines).await {
        Ok(inv) => (StatusCode::OK, Json(serde_json::to_value(inv).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn cash_status(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match cash::get_cash_status(&state.db).await {
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
    match cash::open_cash_session(&state.db, payload).await {
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
    match cash::close_cash_session(&state.db, payload).await {
        Ok(s) => (StatusCode::OK, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_receivables(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match cash::list_receivables(&state.db).await {
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
    match cash::pay_receivable(&state.db, id, payload).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_expenses(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match cash::list_expenses(&state.db).await {
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
    match cash::create_expense(&state.db, payload).await {
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
    match purchases::list_suppliers(&state.db, q.search.as_deref()).await {
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
    match purchases::create_supplier(&state.db, payload).await {
        Ok(s) => (StatusCode::CREATED, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_purchases(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match purchases::list_purchase_orders(&state.db).await {
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
    match purchases::create_purchase_order(&state.db, payload).await {
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
    match purchases::receive_purchase_order(&state.db, id, payload).await {
        Ok(rec) => (StatusCode::CREATED, Json(serde_json::to_value(rec).unwrap())).into_response(),
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
    match purchases::list_supplier_debts(&state.db).await {
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
    match purchases::pay_supplier_debt(&state.db, id, payload).await {
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
    match consignments::get_overview(&state.db).await {
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
    match consignments::create_returnable_type(&state.db, payload).await {
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
    match consignments::adjust_returnable_stock(&state.db, payload).await {
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
    match consignments::return_client_empties(&state.db, payload).await {
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
    match reports::get_reports_overview(&state.db, q.from.as_deref(), q.to.as_deref()).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn get_settings(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match reports::get_settings_bundle(&state.db).await {
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
    match reports::update_settings(&state.db, payload).await {
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
    match reports::add_payment_method(&state.db, &payload.label).await {
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
    match reports::toggle_payment_method(&state.db, &code, payload.active).await {
        Ok(pm) => (StatusCode::OK, Json(serde_json::to_value(pm).unwrap())).into_response(),
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
    match backup::create_backup_summary(&state.db, &state.backup_dir).await {
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

async fn restore_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
) -> impl IntoResponse {
    if let Err(e) = require_auth(&state, &headers).await {
        return e.into_response();
    }
    match backup::restore_backup(&state.db, &state.backup_dir, &name).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
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
        db,
        backup_dir,
        tokens: Arc::new(RwLock::new(HashSet::new())),
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
        .route("/api/clients/:id/credit", put(update_client_credit))
        .route("/api/sales", get(list_sales).post(create_sale))
        .route("/api/sales/:id", get(get_sale))
        .route("/api/sales/:id/cancel", post(cancel_sale))
        .route("/api/sales/:id/returns", post(return_sale))
        .route("/api/receivables", get(list_receivables))
        .route("/api/receivables/:id/pay", post(pay_receivable))
        .route("/api/suppliers", get(list_suppliers).post(create_supplier))
        .route("/api/purchases", get(list_purchases).post(create_purchase))
        .route("/api/purchases/:id/receive", post(receive_purchase))
        .route("/api/supplier-debts", get(list_supplier_debts))
        .route("/api/supplier-debts/:id/pay", post(pay_supplier_debt))
        .route("/api/stock", get(stock_overview))
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
        .route("/api/settings", get(get_settings).put(update_settings))
        .route("/api/payment-methods", post(add_payment_method))
        .route("/api/payment-methods/:code", put(toggle_payment_method))
        .route("/api/backups", get(list_backups).post(create_backup))
        .route("/api/backups/:name/verify", get(verify_backup))
        .route("/api/backups/:name/restore", post(restore_backup))
        .with_state(state);

    let dist_dir = PathBuf::from("./dist");
    if dist_dir.exists() {
        app = app.fallback_service(ServeDir::new(dist_dir));
    }

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    tracing::info!("DEPOTPRO Axum server listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
