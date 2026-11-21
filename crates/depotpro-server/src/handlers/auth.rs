// ============================================================================
// Handlers HTTP : Authentification, utilisateurs & tableau de bord
// ============================================================================

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json};
use chrono::Utc;

use depotpro_core::application::auth::{self, Permission};
use depotpro_core::application::reports;

use crate::dto::{ChangePinPayload, PinPayload, ToggleUserStatusPayload};
use crate::state::{extract_axum_token, map_err, require_auth, require_perm, AppState};

pub(crate) async fn auth_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
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

pub(crate) async fn auth_setup(
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

pub(crate) async fn auth_login(
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

pub(crate) async fn auth_me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    match require_auth(&state, &headers).await {
        Ok(user) => (StatusCode::OK, Json(serde_json::json!({ "user": user }))).into_response(),
        Err(e) => e.into_response(),
    }
}

pub(crate) async fn auth_lock(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Some(token) = extract_axum_token(&headers) {
        state.sessions.write().await.revoke(token);
    }
    (StatusCode::OK, Json(serde_json::json!({ "locked": true }))).into_response()
}

pub(crate) async fn auth_change_pin(
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

pub(crate) async fn auth_list_users(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
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

pub(crate) async fn auth_create_user(
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

pub(crate) async fn auth_toggle_user(
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

pub(crate) async fn dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
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
