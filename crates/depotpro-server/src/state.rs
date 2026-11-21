// ============================================================================
// État applicatif, limitation de débit et helpers d'authentification Axum
// ============================================================================

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::http::{HeaderMap, StatusCode};
use axum::response::Json;
use chrono::Utc;
use tokio::sync::RwLock;

use depotpro_core::application::auth::{self, Permission, SessionIdentity, SessionStore};
use depotpro_core::infrastructure::db::DepotDb;
use depotpro_core::CoreError;

#[derive(Default)]
pub(crate) struct AuthRateLimiter {
    buckets: HashMap<String, (u32, Instant)>,
}

impl AuthRateLimiter {
    pub(crate) fn check(&mut self, key: &str, now: Instant) -> bool {
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

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) db: Arc<RwLock<DepotDb>>,
    pub(crate) backup_dir: PathBuf,
    pub(crate) sessions: Arc<RwLock<SessionStore>>,
    pub(crate) auth_limiter: Arc<RwLock<AuthRateLimiter>>,
}

impl AppState {
    pub(crate) async fn db(&self) -> DepotDb {
        self.db.read().await.clone()
    }
}

pub(crate) fn map_err(err: CoreError) -> (StatusCode, Json<serde_json::Value>) {
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

pub(crate) fn extract_axum_token(headers: &HeaderMap) -> Option<&str> {
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

pub(crate) async fn require_auth(
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

pub(crate) async fn require_perm(
    state: &AppState,
    headers: &HeaderMap,
    permission: Permission,
) -> Result<SessionIdentity, (StatusCode, Json<serde_json::Value>)> {
    let identity = require_auth(state, headers).await?;
    auth::require_permission(&identity, permission).map_err(map_err)?;
    Ok(identity)
}
