use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, Method, Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post, put};
use axum::Router;
use chrono::Utc;
use serde::Deserialize;
use tokio::sync::RwLock;
use tower_http::services::{ServeDir, ServeFile};

use depotpro_core::application::auth::{self, Permission, SessionIdentity, SessionStore};
use depotpro_core::application::{
    cash, catalogue, consignments, inventory, pdf, products, purchases, reports, sales,
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
        let entry = self
            .buckets
            .entry(key.to_string())
            .or_insert((0, now + window));
        if now > entry.1 {
            *entry = (1, now + window);
            return true;
        }
        entry.0 += 1;
        entry.0 <= 25
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedOrigin {
    scheme: String,
    host: String,
    port: Option<u16>,
}

fn parse_origin(raw: &str) -> Option<ParsedOrigin> {
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.contains('@')
        || trimmed.contains('?')
        || trimmed.contains('#')
        || trimmed.contains('\\')
    {
        return None;
    }

    let (scheme_raw, rest) = trimmed.split_once("://")?;
    let scheme = scheme_raw.to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return None;
    }
    if rest.is_empty() || rest.contains('/') {
        return None;
    }

    let (host, port) = parse_host_port(rest)?;
    let default_port = if scheme == "https" { 443 } else { 80 };
    let normalized_port = match port {
        Some(p) if p == default_port => None,
        other => other,
    };

    Some(ParsedOrigin {
        scheme,
        host,
        port: normalized_port,
    })
}

fn parse_host_port(raw: &str) -> Option<(String, Option<u16>)> {
    let s = raw.trim();
    if s.is_empty() || s.contains('/') || s.contains('@') || s.contains(char::is_whitespace) {
        return None;
    }

    if let Some(after_open) = s.strip_prefix('[') {
        let (addr, remainder) = after_open.split_once(']')?;
        if addr.is_empty() {
            return None;
        }
        let host = format!("[{}]", addr.to_ascii_lowercase());
        if remainder.is_empty() {
            return Some((host, None));
        }
        let port_str = remainder.strip_prefix(':')?;
        let port = port_str.parse::<u16>().ok().filter(|p| *p > 0)?;
        return Some((host, Some(port)));
    }

    if let Some((h, p_str)) = s.rsplit_once(':') {
        if h.is_empty() || h.contains(':') {
            return None;
        }
        let port = p_str.parse::<u16>().ok().filter(|p| *p > 0)?;
        if !is_valid_hostname(h) {
            return None;
        }
        Some((h.to_ascii_lowercase(), Some(port)))
    } else {
        if !is_valid_hostname(s) {
            return None;
        }
        Some((s.to_ascii_lowercase(), None))
    }
}

fn is_valid_hostname(h: &str) -> bool {
    !h.is_empty()
        && !h.starts_with('.')
        && !h.ends_with('.')
        && h.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'.')
}

fn is_loopback_host(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "[::1]")
}

fn is_allowed_origin(
    origin: &str,
    host_header: &str,
    forwarded_host_header: Option<&str>,
    trust_proxy: bool,
    extra_allowed: &str,
) -> bool {
    let Some(parsed) = parse_origin(origin) else {
        return false;
    };

    if is_loopback_host(&parsed.host) {
        return true;
    }

    if trust_proxy {
        let effective_host = forwarded_host_header
            .and_then(|v| v.split(',').next())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(host_header);
        if let Some((h, p)) = parse_host_port(effective_host) {
            let default_port = if parsed.scheme == "https" { 443 } else { 80 };
            let host_norm_port = match p {
                Some(port) if port == default_port => None,
                other => other,
            };
            if parsed.host == h && parsed.port == host_norm_port {
                return true;
            }
        }
    }

    extra_allowed
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .any(|allowed| match parse_origin(allowed) {
            Some(allowed_parsed) => allowed_parsed == parsed,
            None => false,
        })
}

fn trust_proxy_enabled() -> bool {
    std::env::var("DEPOTPRO_TRUST_PROXY")
        .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
        .unwrap_or(false)
}

#[derive(Clone)]
struct AppState {
    db: Arc<RwLock<DepotDb>>,
    backup_dir: PathBuf,
    sessions: Arc<RwLock<SessionStore>>,
    auth_limiter: Arc<RwLock<AuthRateLimiter>>,
}

impl AppState {
    async fn db(&self) -> DepotDb {
        self.db.read().await.clone()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PinPayload {
    pin: String,
    username: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangePinPayload {
    current_pin: String,
    new_pin: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ToggleUserStatusPayload {
    active: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptedBackupPayload {
    passphrase: String,
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

impl From<SearchQuery> for catalogue::PaginatedQuery {
    fn from(q: SearchQuery) -> Self {
        catalogue::PaginatedQuery {
            page: q.page.unwrap_or(1).max(1),
            page_size: q.page_size.unwrap_or(50).clamp(1, 200),
            search: q.search,
            include_archived: q.include_archived,
        }
    }
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
    let message = err.to_string();
    let (status, code) = match &err {
        CoreError::Unauthorized(_) => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED"),
        CoreError::Forbidden(_) => (StatusCode::FORBIDDEN, "FORBIDDEN"),
        CoreError::RateLimited(_) => (StatusCode::TOO_MANY_REQUESTS, "RATE_LIMITED"),
        CoreError::Validation(_) => (StatusCode::BAD_REQUEST, "VALIDATION_ERROR"),
        CoreError::InsufficientStock(_) => (StatusCode::BAD_REQUEST, "INSUFFICIENT_STOCK"),
        CoreError::CreditPolicyViolation(_) => (StatusCode::BAD_REQUEST, "CREDIT_POLICY_VIOLATION"),
        CoreError::SessionNotOpen(_) => (StatusCode::BAD_REQUEST, "SESSION_NOT_OPEN"),
        CoreError::SessionAlreadyOpen(_) => (StatusCode::BAD_REQUEST, "SESSION_ALREADY_OPEN"),
        CoreError::HistoricalImmutable(_) => (StatusCode::BAD_REQUEST, "HISTORICAL_IMMUTABLE"),
        CoreError::InvalidPayment(_) => (StatusCode::BAD_REQUEST, "INVALID_PAYMENT"),
        CoreError::DuplicateOperation(_) => (StatusCode::CONFLICT, "DUPLICATE_OPERATION"),
        CoreError::NotFound(_) => (StatusCode::NOT_FOUND, "NOT_FOUND"),
        CoreError::DatabaseBusy(_) => (StatusCode::SERVICE_UNAVAILABLE, "DATABASE_BUSY"),
        CoreError::Database(_) => (StatusCode::INTERNAL_SERVER_ERROR, "DATABASE_ERROR"),
        CoreError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR"),
    };
    (
        status,
        Json(serde_json::json!({ "code": code, "message": message })),
    )
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
) -> Result<SessionIdentity, (StatusCode, Json<serde_json::Value>)> {
    let token = extract_axum_token(headers).ok_or_else(|| {
        map_err(CoreError::Unauthorized(
            "Session verrouillée ou expirée.".to_string(),
        ))
    })?;
    let mut store = state.sessions.write().await;
    store.validate_and_touch(token, Utc::now()).map_err(map_err)
}

async fn require_perm(
    state: &AppState,
    headers: &HeaderMap,
    permission: Permission,
) -> Result<SessionIdentity, (StatusCode, Json<serde_json::Value>)> {
    let identity = require_auth(state, headers).await?;
    auth::require_permission(&identity, permission).map_err(map_err)?;
    Ok(identity)
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok", "engine": "depotpro-axum" }))
}

async fn auth_status(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let db = state.db().await;
    match auth::get_auth_status(&db).await {
        Ok(dto) => {
            let user = if let Some(tok) = extract_axum_token(&headers) {
                state
                    .sessions
                    .write()
                    .await
                    .validate_and_touch(tok, Utc::now())
                    .ok()
            } else {
                None
            };
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "needsSetup": dto.needs_setup,
                    "lockedUntil": dto.locked_until,
                    "failedAttempts": dto.failed_attempts,
                    "authenticated": user.is_some(),
                    "user": user,
                })),
            )
                .into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}

async fn auth_setup(
    State(state): State<AppState>,
    Json(payload): Json<PinPayload>,
) -> impl IntoResponse {
    let db = state.db().await;
    match auth::setup_owner_pin(&db, &payload.pin).await {
        Ok(identity) => {
            let session = state.sessions.write().await.issue_session(identity.clone());
            (
                StatusCode::OK,
                Json(serde_json::json!({ "token": session.token, "user": identity })),
            )
                .into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}

async fn auth_login(
    State(state): State<AppState>,
    Json(payload): Json<PinPayload>,
) -> impl IntoResponse {
    let db = state.db().await;
    match auth::verify_user_login(&db, payload.username.as_deref(), &payload.pin).await {
        Ok(identity) => {
            let session = state.sessions.write().await.issue_session(identity.clone());
            (
                StatusCode::OK,
                Json(serde_json::json!({ "token": session.token, "user": identity })),
            )
                .into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}

async fn auth_me(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    match require_auth(&state, &headers).await {
        Ok(identity) => (
            StatusCode::OK,
            Json(serde_json::json!({ "user": identity })),
        )
            .into_response(),
        Err(e) => e.into_response(),
    }
}

async fn auth_lock(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if let Some(token) = extract_axum_token(&headers) {
        state.sessions.write().await.revoke(token);
    }
    (StatusCode::OK, Json(serde_json::json!({ "locked": true }))).into_response()
}

async fn auth_change_pin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ChangePinPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SecurityChangeOwnerPin).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let current_token = extract_axum_token(&headers).map(str::to_string);
    match auth::with_actor(
        actor,
        auth::change_owner_pin(&db, &payload.current_pin, &payload.new_pin),
    )
    .await
    {
        Ok(()) => {
            state
                .sessions
                .write()
                .await
                .revoke_except(current_token.as_deref());
            (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}

async fn auth_list_users(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SecurityManageUsers).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, auth::list_users(&db)).await {
        Ok(users) => (StatusCode::OK, Json(serde_json::to_value(users).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn auth_create_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<auth::CreateUserInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SecurityManageUsers).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, auth::create_user(&db, payload)).await {
        Ok(user) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(user).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn auth_toggle_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<ToggleUserStatusPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SecurityManageUsers).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, auth::set_user_active(&db, id, payload.active)).await {
        Ok(user) => {
            if !user.active {
                state
                    .sessions
                    .write()
                    .await
                    .revoke_user_sessions(&user.id.to_string());
            }
            (StatusCode::OK, Json(serde_json::to_value(user).unwrap())).into_response()
        }
        Err(e) => map_err(e).into_response(),
    }
}

async fn dashboard(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, reports::get_dashboard_data(&db)).await {
        Ok(data) => (StatusCode::OK, Json(serde_json::to_value(data).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_categories(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
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

async fn create_category(
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

async fn list_products(
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

async fn create_product(
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

async fn update_product(
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

async fn upsert_packaging(
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

async fn export_products_csv(
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

async fn import_products_csv(
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

// ==================== CATALOGUE HANDLERS ====================

async fn list_brands(
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

async fn create_brand(
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

async fn update_brand(
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

async fn delete_brand(
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

async fn list_bottle_profiles(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::list_bottle_profile(&db, q.into())).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_bottle_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateBottleProfileInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_bottle_profile(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_bottle_profile(
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

async fn delete_bottle_profile(
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

async fn list_crate_types(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::list_crate_type(&db, q.into())).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_crate_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateCrateTypeInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_crate_type(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_crate_type(
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

async fn delete_crate_type(
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

async fn list_compatibility_groups(
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

async fn create_compatibility_group(
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

async fn update_compatibility_group(
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

async fn delete_compatibility_group(
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

async fn list_disposable_packaging_types(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        catalogue::list_disposable_packaging_type(&db, q.into()),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_disposable_packaging_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateDisposablePackagingTypeInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        catalogue::create_disposable_packaging_type(&db, payload),
    )
    .await
    {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_disposable_packaging_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateDisposablePackagingTypeInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        catalogue::update_disposable_packaging_type(&db, id, payload),
    )
    .await
    {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn delete_disposable_packaging_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_disposable_packaging_type(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_packaging_materials(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::list_packaging_material(&db, q.into())).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_packaging_material(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreatePackagingMaterialInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_packaging_material(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_packaging_material(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdatePackagingMaterialInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        catalogue::update_packaging_material(&db, id, payload),
    )
    .await
    {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn delete_packaging_material(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_packaging_material(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_container_types(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::list_container_type(&db, q.into())).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_container_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateContainerTypeInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_container_type(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_container_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateContainerTypeInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::update_container_type(&db, id, payload)).await {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn delete_container_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_container_type(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_units_of_measure(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::list_unit_of_measure(&db, q.into())).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_unit_of_measure(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateUnitOfMeasureInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_unit_of_measure(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_unit_of_measure(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateUnitOfMeasureInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::update_unit_of_measure(&db, id, payload)).await {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn delete_unit_of_measure(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_unit_of_measure(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_product_variants(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
    Query(prod_q): Query<catalogue::PaginatedQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let product_id = q.search.as_deref().and_then(|s| s.parse::<i64>().ok());
    let cq = catalogue::PaginatedQuery {
        page: prod_q.page,
        page_size: prod_q.page_size,
        search: prod_q.search,
        include_archived: prod_q.include_archived,
    };
    match auth::with_actor(actor, catalogue::list_product_variants(&db, cq, product_id)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_product_variant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateProductVariantInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_product_variant(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_product_variant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateProductVariantInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::update_product_variant(&db, id, payload)).await {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn delete_product_variant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_product_variant(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_supplier_prices(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
    Query(sup_q): Query<catalogue::PaginatedQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let supplier_id = q.search.as_deref().and_then(|s| s.parse::<i64>().ok());
    let cq = catalogue::PaginatedQuery {
        page: sup_q.page,
        page_size: sup_q.page_size,
        search: sup_q.search,
        include_archived: sup_q.include_archived,
    };
    match auth::with_actor(
        actor,
        catalogue::list_supplier_prices(&db, cq, supplier_id, None),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_supplier_price(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateSupplierProductPriceInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_supplier_price(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_supplier_price(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateSupplierProductPriceInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::update_supplier_price(&db, id, payload)).await {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn delete_supplier_price(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_supplier_price(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_customer_price_lists(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::list_customer_price_lists(&db, q.into())).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_customer_price_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateCustomerPriceListInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_customer_price_list(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_customer_price_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateCustomerPriceListInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        catalogue::update_customer_price_list(&db, id, payload),
    )
    .await
    {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn delete_customer_price_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_customer_price_list(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_customer_price_list_items(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
    Query(pl_q): Query<catalogue::PaginatedQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let price_list_id = q.search.as_deref().and_then(|s| s.parse::<i64>().ok());
    let cq = catalogue::PaginatedQuery {
        page: pl_q.page,
        page_size: pl_q.page_size,
        search: pl_q.search,
        include_archived: pl_q.include_archived,
    };
    match auth::with_actor(
        actor,
        catalogue::list_customer_price_list_items(&db, cq, price_list_id),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_customer_price_list_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreateCustomerPriceListItemInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        catalogue::create_customer_price_list_item(&db, payload),
    )
    .await
    {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_customer_price_list_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdateCustomerPriceListItemInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        catalogue::update_customer_price_list_item(&db, id, payload),
    )
    .await
    {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn delete_customer_price_list_item(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_customer_price_list_item(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_packaging_values(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
    Query(pv_q): Query<catalogue::PaginatedQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let returnable_id = q.search.as_deref().and_then(|s| s.parse::<i64>().ok());
    let cq = catalogue::PaginatedQuery {
        page: pv_q.page,
        page_size: pv_q.page_size,
        search: pv_q.search,
        include_archived: pv_q.include_archived,
    };
    match auth::with_actor(
        actor,
        catalogue::list_packaging_values(&db, cq, returnable_id),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_packaging_value(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<catalogue::CreatePackagingValueInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::create_packaging_value(&db, payload)).await {
        Ok(c) => (StatusCode::CREATED, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_packaging_value(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<catalogue::UpdatePackagingValueInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::update_packaging_value(&db, id, payload)).await {
        Ok(c) => (StatusCode::OK, Json(serde_json::to_value(c).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn delete_packaging_value(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, catalogue::delete_packaging_value(&db, id)).await {
        Ok(_) => (StatusCode::NO_CONTENT).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_price_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<SearchQuery>,
    Query(ph_q): Query<catalogue::PaginatedQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CatalogRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    let entity_type = q.search.as_deref().map(|s| s.to_string());
    let entity_id = q.search.as_deref().and_then(|s| s.parse::<i64>().ok());
    let cq = catalogue::PaginatedQuery {
        page: ph_q.page,
        page_size: ph_q.page_size,
        search: ph_q.search,
        include_archived: ph_q.include_archived,
    };
    match auth::with_actor(
        actor,
        catalogue::list_price_history(&db, cq, entity_type, entity_id),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_clients(
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

async fn create_client(
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

async fn update_client(
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

async fn update_client_credit(
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

async fn list_sales(
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

async fn get_sale(
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

async fn create_sale(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<sales::CreateSaleInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SalesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, sales::create_sale(&db, payload)).await {
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

async fn return_sale(
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

async fn stock_overview(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::StockRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, inventory::get_stock_overview(&db)).await {
        Ok(ov) => (StatusCode::OK, Json(serde_json::to_value(ov).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn adjust_stock(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<inventory::AdjustStockInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::StockAdjust).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, inventory::adjust_stock(&db, payload)).await {
        Ok(mv) => (StatusCode::CREATED, Json(serde_json::to_value(mv).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_inventories(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::StockRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, inventory::list_inventories(&db)).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_inventory(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateInventoryPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::InventoryValidate).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        inventory::create_inventory(&db, payload.notes.as_deref()),
    )
    .await
    {
        Ok(inv) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(inv).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn validate_inventory(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(payload): Json<ValidateInventoryPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::InventoryValidate).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, inventory::validate_inventory(&db, id, payload.lines)).await {
        Ok(inv) => (StatusCode::OK, Json(serde_json::to_value(inv).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn cash_status(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CashRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::get_cash_status(&db)).await {
        Ok(s) => (StatusCode::OK, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn open_cash(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<cash::OpenCashInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CashOperate).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::open_cash_session(&db, payload)).await {
        Ok(s) => (StatusCode::CREATED, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn close_cash(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<cash::CloseCashInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CashOperate).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::close_cash_session(&db, payload)).await {
        Ok(s) => (StatusCode::OK, Json(serde_json::to_value(s).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_receivables(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ReceivablesRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::list_receivables(&db)).await {
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
    let actor = match require_perm(&state, &headers, Permission::ReceivablesPay).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::pay_receivable(&db, id, payload)).await {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_expenses(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::CashRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::list_expenses(&db)).await {
        Ok(ov) => (StatusCode::OK, Json(serde_json::to_value(ov).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_expense(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<cash::CreateExpenseInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ExpensesWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, cash::create_expense(&db, payload)).await {
        Ok(exp) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(exp).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn list_suppliers(
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

async fn create_supplier(
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

async fn update_supplier(
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

async fn list_purchases(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
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

async fn create_purchase(
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

async fn receive_purchase(
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

async fn cancel_purchase(
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

async fn list_supplier_debts(
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

async fn pay_supplier_debt(
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

async fn consignments_overview(
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

async fn create_returnable_type(
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

async fn adjust_returnable_stock(
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

async fn return_client_empties(
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

async fn reports_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ReportQuery>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::ReportsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        reports::get_reports_overview(&db, q.from.as_deref(), q.to.as_deref()),
    )
    .await
    {
        Ok(r) => (StatusCode::OK, Json(serde_json::to_value(r).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn get_settings(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SettingsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, reports::get_settings_bundle(&db)).await {
        Ok(bundle) => (StatusCode::OK, Json(serde_json::to_value(bundle).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn update_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<reports::UpdateSettingsInput>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SettingsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, reports::update_settings(&db, payload)).await {
        Ok(bundle) => (StatusCode::OK, Json(serde_json::to_value(bundle).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn add_payment_method(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AddPaymentMethodPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::SettingsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, reports::add_payment_method(&db, &payload.label)).await {
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
    let actor = match require_perm(&state, &headers, Permission::SettingsWrite).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        reports::toggle_payment_method(&db, &code, payload.active),
    )
    .await
    {
        Ok(pm) => (StatusCode::OK, Json(serde_json::to_value(pm).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn generate_document_pdf(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<pdf::DocumentPdfInput>,
) -> impl IntoResponse {
    let needed = match payload.doc_type.as_str() {
        "BON_COMMANDE" | "BON_RECEPTION" => Permission::PurchasesRead,
        "CLOTURE_CAISSE" => Permission::CashRead,
        _ => Permission::SalesRead,
    };
    let actor = match require_perm(&state, &headers, needed).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, pdf::generate_document_pdf(&db, payload)).await {
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
    let actor = match require_perm(&state, &headers, Permission::BackupsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let dir = state.backup_dir.clone();
    match auth::with_actor(actor, async move { backup::list_backups(&dir) }).await {
        Ok(items) => (StatusCode::OK, Json(serde_json::to_value(items).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_backup(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsCreate).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(actor, backup::create_backup_summary(&db, &state.backup_dir)).await {
        Ok(summary) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(summary).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn create_encrypted_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<EncryptedBackupPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsCreate).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let db = state.db().await;
    match auth::with_actor(
        actor,
        backup::create_encrypted_backup(&db, &state.backup_dir, &payload.passphrase),
    )
    .await
    {
        Ok(summary) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(summary).unwrap()),
        )
            .into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn verify_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    match auth::with_actor(actor, backup::verify_backup(&state.backup_dir, &name)).await {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn verify_encrypted_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Json(payload): Json<EncryptedBackupPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    match auth::with_actor(
        actor,
        backup::verify_encrypted_backup(&state.backup_dir, &name, &payload.passphrase),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn download_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsRead).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    let dir = state.backup_dir.clone();
    match auth::with_actor(actor, async move { backup::read_backup_bytes(&dir, &name) }).await {
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
    let actor = match require_perm(&state, &headers, Permission::BackupsRestore).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    match auth::with_actor(
        actor,
        backup::restore_and_reconnect(&state.db, &state.backup_dir, &name),
    )
    .await
    {
        Ok(res) => (StatusCode::OK, Json(serde_json::to_value(res).unwrap())).into_response(),
        Err(e) => map_err(e).into_response(),
    }
}

async fn restore_encrypted_backup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Json(payload): Json<EncryptedBackupPayload>,
) -> impl IntoResponse {
    let actor = match require_perm(&state, &headers, Permission::BackupsRestore).await {
        Ok(a) => a,
        Err(e) => return e.into_response(),
    };
    match auth::with_actor(
        actor,
        backup::restore_encrypted_backup_and_reconnect(
            &state.db,
            &state.backup_dir,
            &name,
            &payload.passphrase,
        ),
    )
    .await
    {
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
    let trust_proxy = trust_proxy_enabled();

    if is_mutating {
        if let Some(origin) = req
            .headers()
            .get(header::ORIGIN)
            .and_then(|v| v.to_str().ok())
        {
            let host = req
                .headers()
                .get(header::HOST)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("");
            let forwarded_host = if trust_proxy {
                req.headers()
                    .get("x-forwarded-host")
                    .and_then(|v| v.to_str().ok())
            } else {
                None
            };
            let extra = std::env::var("DEPOTPRO_ALLOWED_ORIGINS").unwrap_or_default();
            if !is_allowed_origin(origin, host, forwarded_host, trust_proxy, &extra) {
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
        let peer_ip = req
            .extensions()
            .get::<ConnectInfo<SocketAddr>>()
            .map(|ci| ci.0.ip().to_string());
        let forwarded_ip = if trust_proxy {
            req.headers()
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.split(',').next())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
        } else {
            None
        };
        let client_ip = forwarded_ip
            .or(peer_ip)
            .unwrap_or_else(|| "local".to_string());
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
    headers.insert(
        header::X_FRAME_OPTIONS,
        HeaderValue::from_static("SAMEORIGIN"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    if path.starts_with("/api") {
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    }
}

fn build_router(state: AppState) -> Router {
    let mut app = Router::new()
        .route("/api/health", get(health))
        .route("/api/auth/status", get(auth_status))
        .route("/api/auth/setup", post(auth_setup))
        .route("/api/auth/login", post(auth_login))
        .route("/api/auth/me", get(auth_me))
        .route("/api/auth/lock", post(auth_lock))
        .route("/api/auth/change-pin", post(auth_change_pin))
        .route(
            "/api/auth/users",
            get(auth_list_users).post(auth_create_user),
        )
        .route("/api/auth/users/:id/status", put(auth_toggle_user))
        .route("/api/dashboard", get(dashboard))
        .route(
            "/api/categories",
            get(list_categories).post(create_category),
        )
        .route("/api/products", get(list_products).post(create_product))
        .route("/api/products/:id", put(update_product))
        .route("/api/products/:id/packagings", post(upsert_packaging))
        .route("/api/products/export/csv", get(export_products_csv))
        .route("/api/products/import/csv", post(import_products_csv))
        // ==================== CATALOGUE ROUTES ====================
        .route("/api/brands", get(list_brands).post(create_brand))
        .route("/api/brands/:id", put(update_brand).delete(delete_brand))
        .route(
            "/api/bottle-profiles",
            get(list_bottle_profiles).post(create_bottle_profile),
        )
        .route(
            "/api/bottle-profiles/:id",
            put(update_bottle_profile).delete(delete_bottle_profile),
        )
        .route(
            "/api/crate-types",
            get(list_crate_types).post(create_crate_type),
        )
        .route(
            "/api/crate-types/:id",
            put(update_crate_type).delete(delete_crate_type),
        )
        .route(
            "/api/compatibility-groups",
            get(list_compatibility_groups).post(create_compatibility_group),
        )
        .route(
            "/api/compatibility-groups/:id",
            put(update_compatibility_group).delete(delete_compatibility_group),
        )
        .route(
            "/api/disposable-packaging-types",
            get(list_disposable_packaging_types).post(create_disposable_packaging_type),
        )
        .route(
            "/api/disposable-packaging-types/:id",
            put(update_disposable_packaging_type).delete(delete_disposable_packaging_type),
        )
        .route(
            "/api/packaging-materials",
            get(list_packaging_materials).post(create_packaging_material),
        )
        .route(
            "/api/packaging-materials/:id",
            put(update_packaging_material).delete(delete_packaging_material),
        )
        .route(
            "/api/container-types",
            get(list_container_types).post(create_container_type),
        )
        .route(
            "/api/container-types/:id",
            put(update_container_type).delete(delete_container_type),
        )
        .route(
            "/api/units-of-measure",
            get(list_units_of_measure).post(create_unit_of_measure),
        )
        .route(
            "/api/units-of-measure/:id",
            put(update_unit_of_measure).delete(delete_unit_of_measure),
        )
        .route(
            "/api/product-variants",
            get(list_product_variants).post(create_product_variant),
        )
        .route(
            "/api/product-variants/:id",
            put(update_product_variant).delete(delete_product_variant),
        )
        .route(
            "/api/supplier-prices",
            get(list_supplier_prices).post(create_supplier_price),
        )
        .route(
            "/api/supplier-prices/:id",
            put(update_supplier_price).delete(delete_supplier_price),
        )
        .route(
            "/api/customer-price-lists",
            get(list_customer_price_lists).post(create_customer_price_list),
        )
        .route(
            "/api/customer-price-lists/:id",
            put(update_customer_price_list).delete(delete_customer_price_list),
        )
        .route(
            "/api/customer-price-list-items",
            get(list_customer_price_list_items).post(create_customer_price_list_item),
        )
        .route(
            "/api/customer-price-list-items/:id",
            put(update_customer_price_list_item).delete(delete_customer_price_list_item),
        )
        .route(
            "/api/packaging-values",
            get(list_packaging_values).post(create_packaging_value),
        )
        .route(
            "/api/packaging-values/:id",
            put(update_packaging_value).delete(delete_packaging_value),
        )
        .route("/api/price-history", get(list_price_history))
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
        .route(
            "/api/inventories",
            get(list_inventories).post(create_inventory),
        )
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
        .route("/api/backups/encrypted", post(create_encrypted_backup))
        .route("/api/backups/:name/verify", get(verify_backup))
        .route(
            "/api/backups/:name/verify-encrypted",
            post(verify_encrypted_backup),
        )
        .route("/api/backups/:name/download", get(download_backup))
        .route("/api/backups/:name/restore", post(restore_backup))
        .route(
            "/api/backups/:name/restore-encrypted",
            post(restore_encrypted_backup),
        )
        .layer(middleware::from_fn_with_state(
            state.clone(),
            security_middleware,
        ))
        .with_state(state);

    let dist_dir = PathBuf::from("./dist");
    if dist_dir.exists() {
        let index_file = dist_dir.join("index.html");
        app = app.fallback_service(ServeDir::new(&dist_dir).fallback(ServeFile::new(index_file)));
    }
    app
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
        sessions: Arc::new(RwLock::new(SessionStore::default())),
        auth_limiter: Arc::new(RwLock::new(AuthRateLimiter::default())),
    };

    let app = build_router(state);

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
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    async fn send_http(
        addr: SocketAddr,
        method: &str,
        path: &str,
        headers: &[(&str, &str)],
        body: Option<&str>,
    ) -> (u16, String) {
        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        let body_bytes = body.unwrap_or("");
        let mut req = format!("{method} {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n");
        for (k, v) in headers {
            req.push_str(&format!("{k}: {v}\r\n"));
        }
        if !body_bytes.is_empty() {
            req.push_str("Content-Type: application/json\r\n");
            req.push_str(&format!("Content-Length: {}\r\n", body_bytes.len()));
        }
        req.push_str("\r\n");
        req.push_str(body_bytes);
        stream.write_all(req.as_bytes()).await.unwrap();
        let mut raw = Vec::new();
        stream.read_to_end(&mut raw).await.unwrap();
        let text = String::from_utf8_lossy(&raw).to_string();
        let status_line = text.lines().next().unwrap_or("");
        let status = status_line
            .split_whitespace()
            .nth(1)
            .and_then(|s| s.parse::<u16>().ok())
            .unwrap_or(0);
        let body_text = text.split_once("\r\n\r\n").map(|(_, b)| b).unwrap_or("");
        (status, body_text.to_string())
    }

    #[test]
    fn origin_allowlist_blocks_prefix_spoof_and_untrusted_proxy_headers() {
        assert!(is_allowed_origin(
            "http://localhost:3000",
            "127.0.0.1:3000",
            None,
            false,
            ""
        ));
        assert!(is_allowed_origin(
            "http://127.0.0.1:3100",
            "127.0.0.1:3000",
            None,
            false,
            ""
        ));
        assert!(is_allowed_origin(
            "http://[::1]:3000",
            "127.0.0.1:3000",
            None,
            false,
            ""
        ));
        assert!(!is_allowed_origin(
            "https://evil.example",
            "127.0.0.1:3000",
            None,
            false,
            ""
        ));
        // Contre les contournements de préfixe
        assert!(!is_allowed_origin(
            "http://localhost:3000.evil.com",
            "localhost:3000",
            None,
            false,
            ""
        ));
        assert!(!is_allowed_origin(
            "http://127.0.0.1.evil.com",
            "127.0.0.1:3000",
            None,
            false,
            ""
        ));
        assert!(!is_allowed_origin(
            "http://user@localhost:3000",
            "localhost:3000",
            None,
            false,
            ""
        ));
        // En-têtes proxy ignorés si DEPOTPRO_TRUST_PROXY=false
        assert!(!is_allowed_origin(
            "https://erp.example.com",
            "erp.example.com",
            Some("erp.example.com"),
            false,
            ""
        ));
        assert!(is_allowed_origin(
            "https://erp.example.com",
            "127.0.0.1:3000",
            Some("erp.example.com"),
            true,
            ""
        ));
        assert!(is_allowed_origin(
            "https://preview.depotpro.local",
            "127.0.0.1:3000",
            None,
            false,
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

    #[tokio::test]
    async fn axum_enforces_session_expiry_revocation_origin_and_rbac() {
        let uid = uuid::Uuid::new_v4();
        let dir = std::env::temp_dir().join(format!("depotpro_axum_sec_{uid}"));
        let db_path = dir.join("test.db");
        let backup_dir = dir.join("backups");
        let db = DepotDb::connect(&db_path).await.unwrap();

        let state = AppState {
            db: Arc::new(RwLock::new(db)),
            backup_dir,
            sessions: Arc::new(RwLock::new(SessionStore::default())),
            auth_limiter: Arc::new(RwLock::new(AuthRateLimiter::default())),
        };
        let app = build_router(state.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let srv = tokio::spawn(async move {
            axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
            .unwrap();
        });

        // 1. Setup PIN
        let (st, setup_body) = send_http(
            addr,
            "POST",
            "/api/auth/setup",
            &[],
            Some(r#"{"pin":"246810"}"#),
        )
        .await;
        assert_eq!(st, 200);
        let setup_json: serde_json::Value = serde_json::from_str(&setup_body).unwrap();
        let owner_token = setup_json["token"].as_str().unwrap().to_string();

        // 2. Sans token -> 401
        let (st, _) = send_http(addr, "GET", "/api/dashboard", &[], None).await;
        assert_eq!(st, 401);

        // 3. Origine malveillante ou contournement préfixe -> 403
        let (st, _) = send_http(
            addr,
            "POST",
            "/api/categories",
            &[
                ("Authorization", &format!("Bearer {owner_token}")),
                ("Origin", "http://127.0.0.1.evil.com"),
            ],
            Some(r#"{"name":"Test"}"#),
        )
        .await;
        assert_eq!(st, 403);

        // 4. Créer un utilisateur Caissier et tester RBAC (403 sur /api/settings PUT, 200 sur /api/sales GET)
        let (st, _) = send_http(
            addr,
            "POST",
            "/api/auth/users",
            &[("Authorization", &format!("Bearer {owner_token}"))],
            Some(r#"{"username":"caisse1","displayName":"Awa Caisse","role":"cashier","pin":"112233"}"#),
        )
        .await;
        assert_eq!(st, 201);

        let (st, login_cashier) = send_http(
            addr,
            "POST",
            "/api/auth/login",
            &[],
            Some(r#"{"username":"caisse1","pin":"112233"}"#),
        )
        .await;
        assert_eq!(st, 200);
        let cashier_json: serde_json::Value = serde_json::from_str(&login_cashier).unwrap();
        let cashier_token = cashier_json["token"].as_str().unwrap().to_string();

        let (st, _) = send_http(
            addr,
            "PUT",
            "/api/settings",
            &[("Authorization", &format!("Bearer {cashier_token}"))],
            Some(r#"{"company_name":"Hack"}"#),
        )
        .await;
        assert_eq!(st, 403);

        let (st, _) = send_http(
            addr,
            "GET",
            "/api/sales",
            &[("Authorization", &format!("Bearer {cashier_token}"))],
            None,
        )
        .await;
        assert_eq!(st, 200);

        // 5. Révocation via /api/auth/lock -> 401 ensuite
        let (st, _) = send_http(
            addr,
            "POST",
            "/api/auth/lock",
            &[("Authorization", &format!("Bearer {cashier_token}"))],
            None,
        )
        .await;
        assert_eq!(st, 200);

        let (st, _) = send_http(
            addr,
            "GET",
            "/api/sales",
            &[("Authorization", &format!("Bearer {cashier_token}"))],
            None,
        )
        .await;
        assert_eq!(st, 401);

        srv.abort();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn axum_lot9_http_json_and_error_code_parity() {
        let uid = uuid::Uuid::new_v4();
        let dir = std::env::temp_dir().join(format!("depotpro_axum_lot9_{uid}"));
        let db_path = dir.join("test.db");
        let backup_dir = dir.join("backups");
        let db = DepotDb::connect(&db_path).await.unwrap();

        let state = AppState {
            db: Arc::new(RwLock::new(db)),
            backup_dir,
            sessions: Arc::new(RwLock::new(SessionStore::default())),
            auth_limiter: Arc::new(RwLock::new(AuthRateLimiter::default())),
        };
        let app = build_router(state.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let srv = tokio::spawn(async move {
            axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
            .unwrap();
        });

        let (st, setup_body) = send_http(
            addr,
            "POST",
            "/api/auth/setup",
            &[],
            Some(r#"{"pin":"246810"}"#),
        )
        .await;
        assert_eq!(st, 200);
        let setup_json: serde_json::Value = serde_json::from_str(&setup_body).unwrap();
        let token = setup_json["token"].as_str().unwrap().to_string();
        let auth_hdr = format!("Bearer {token}");

        // Catégorie + client + politique crédit
        let (st, cat_body) = send_http(
            addr,
            "POST",
            "/api/categories",
            &[("Authorization", &auth_hdr)],
            Some(r#"{"name":"Bières Lot 9"}"#),
        )
        .await;
        assert_eq!(st, 201);
        let cat_id = serde_json::from_str::<serde_json::Value>(&cat_body).unwrap()["id"]
            .as_i64()
            .unwrap();

        let (st, bad_cli) = send_http(
            addr,
            "POST",
            "/api/clients",
            &[("Authorization", &auth_hdr)],
            Some(r#"{"name":"Bad","client_type":"particulier","credit_policy":"invalid"}"#),
        )
        .await;
        assert_eq!(st, 400);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&bad_cli).unwrap()["code"],
            "VALIDATION_ERROR"
        );

        let cli_payload = serde_json::json!({
            "name": "Maquis Axum",
            "client_type": "professionnel",
            "credit_policy": "limited",
            "credit_limit": 50_000,
            "payment_terms_days": 15
        })
        .to_string();
        let (st, cli_body) = send_http(
            addr,
            "POST",
            "/api/clients",
            &[("Authorization", &auth_hdr)],
            Some(&cli_payload),
        )
        .await;
        assert_eq!(st, 201);
        let cli_id = serde_json::from_str::<serde_json::Value>(&cli_body).unwrap()["id"]
            .as_i64()
            .unwrap();

        let (st, pol_body) = send_http(
            addr,
            "PUT",
            &format!("/api/clients/{cli_id}/credit"),
            &[("Authorization", &auth_hdr)],
            Some(r#"{"credit_policy":"limited","credit_limit":80000,"payment_terms_days":30}"#),
        )
        .await;
        assert_eq!(st, 200);
        let pol_json: serde_json::Value = serde_json::from_str(&pol_body).unwrap();
        assert_eq!(pol_json["client_id"], cli_id);
        assert_eq!(pol_json["credit_limit"], 80_000);
        assert_eq!(pol_json["payment_terms_days"], 30);

        // Produit (quantités numériques acceptées) + conditionnement doublon 409 + bool int 0/1
        let prod_payload = serde_json::json!({
            "name": "Flag Axum 65cl",
            "category_id": cat_id,
            "base_unit": "bouteille",
            "initial_stock": 10,
            "min_stock": 2,
            "purchase_price": 450,
            "retail_price": 650
        })
        .to_string();
        let (st, prod_body) = send_http(
            addr,
            "POST",
            "/api/products",
            &[("Authorization", &auth_hdr)],
            Some(&prod_payload),
        )
        .await;
        assert_eq!(st, 201);
        let prod_json: serde_json::Value = serde_json::from_str(&prod_body).unwrap();
        let prod_id = prod_json["id"].as_i64().unwrap();
        let pkg_id = prod_json["packagings"][0]["id"].as_i64().unwrap();
        assert_eq!(prod_json["stock_milli"], 10_000);
        assert_eq!(prod_json["average_cost_fcfa"], 450);

        let (st, dup_pkg) = send_http(
            addr,
            "POST",
            &format!("/api/products/{prod_id}/packagings"),
            &[("Authorization", &auth_hdr)],
            Some(r#"{"name":"bouteille","coefficient":1,"retail_price":700}"#),
        )
        .await;
        assert_eq!(st, 409);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&dup_pkg).unwrap()["code"],
            "DUPLICATE_OPERATION"
        );

        let pack_payload = serde_json::json!({
            "name": "pack",
            "coefficient": 6,
            "retail_price": 3750,
            "allow_fraction": 0,
            "is_active": 1
        })
        .to_string();
        let (st, pack_body) = send_http(
            addr,
            "POST",
            &format!("/api/products/{prod_id}/packagings"),
            &[("Authorization", &auth_hdr)],
            Some(&pack_payload),
        )
        .await;
        assert_eq!(st, 200);
        let pack_json: serde_json::Value = serde_json::from_str(&pack_body).unwrap();
        assert_eq!(pack_json["allow_fraction"], 0);
        assert_eq!(pack_json["is_active"], 1);

        // Caisse + vente + annulation + collision 409 + backup/restore camelCase
        let (st, _) = send_http(
            addr,
            "POST",
            "/api/cash/open",
            &[("Authorization", &auth_hdr)],
            Some(r#"{"opening_cash":25000,"request_key":"axum-lot9-open"}"#),
        )
        .await;
        assert_eq!(st, 201);

        let (st, open_dup) = send_http(
            addr,
            "POST",
            "/api/cash/open",
            &[("Authorization", &auth_hdr)],
            Some(r#"{"opening_cash":1000,"request_key":"axum-lot9-open-dup"}"#),
        )
        .await;
        assert_eq!(st, 400);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&open_dup).unwrap()["code"],
            "SESSION_ALREADY_OPEN"
        );

        let sale_payload = serde_json::json!({
            "request_key": "axum-lot9-sale-1",
            "sale_type": "cash",
            "price_tier": "retail",
            "lines": [{"product_id": prod_id, "packaging_id": pkg_id, "quantity": 2}],
            "payments": [{"method_code": "wave", "amount": 1300}]
        })
        .to_string();
        let (st, sale_body) = send_http(
            addr,
            "POST",
            "/api/sales",
            &[("Authorization", &auth_hdr)],
            Some(&sale_payload),
        )
        .await;
        assert_eq!(st, 201);
        let sale_id = serde_json::from_str::<serde_json::Value>(&sale_body).unwrap()["id"]
            .as_i64()
            .unwrap();

        let cancel_payload = serde_json::json!({
            "reason": "Test Axum",
            "refund_method_code": "wave",
            "request_key": "axum-lot9-cancel-1"
        })
        .to_string();
        let (st, cancel_body) = send_http(
            addr,
            "POST",
            &format!("/api/sales/{sale_id}/cancel"),
            &[("Authorization", &auth_hdr)],
            Some(&cancel_payload),
        )
        .await;
        assert_eq!(st, 200);
        let cancel_json: serde_json::Value = serde_json::from_str(&cancel_body).unwrap();
        assert_eq!(cancel_json["status"], "cancelled");
        assert_eq!(cancel_json["cancellation"]["refund_method_code"], "wave");

        let (st, bkp_body) = send_http(
            addr,
            "POST",
            "/api/backups",
            &[("Authorization", &auth_hdr)],
            None,
        )
        .await;
        assert_eq!(st, 201);
        let bkp_name = serde_json::from_str::<serde_json::Value>(&bkp_body).unwrap()["name"]
            .as_str()
            .unwrap()
            .to_string();

        let (st, rest_body) = send_http(
            addr,
            "POST",
            &format!("/api/backups/{bkp_name}/restore"),
            &[("Authorization", &auth_hdr)],
            None,
        )
        .await;
        assert_eq!(st, 200);
        let rest_json: serde_json::Value = serde_json::from_str(&rest_body).unwrap();
        assert_eq!(rest_json["integrity"], "ok");
        assert_eq!(rest_json["foreignKeyErrors"], 0);
        assert!(rest_json["safetyBackup"].as_str().is_some());

        srv.abort();
        let _ = std::fs::remove_dir_all(&dir);
    }
}
